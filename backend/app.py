from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import base64
import os
import shutil
import subprocess
import tempfile
import zipfile
import xml.etree.ElementTree as ET
import time
from pathlib import Path

import fitz
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor

try:
    from pdf2docx import Converter
except Exception:
    Converter = None

PML_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
DRAW_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'


def emu_to_percent(value, total):
    try:
        return (int(value) / int(total)) * 100
    except Exception:
        return 0

app = Flask(__name__)
CORS(app)

ALLOWED_EXTENSIONS = {'pptx'}
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max

LIBREOFFICE_CANDIDATES = [
    os.environ.get('LIBREOFFICE_PATH', ''),
    os.environ.get('SOFFICE_PATH', ''),
    r'C:\Program Files\LibreOffice\program\soffice.com',
    r'C:\Program Files (x86)\LibreOffice\program\soffice.com',
    shutil.which('soffice') or '',
    shutil.which('libreoffice') or '',
    r'C:\Program Files\LibreOffice\program\soffice.exe',
    r'C:\Program Files (x86)\LibreOffice\program\soffice.exe',
]

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def find_libreoffice_executable():
    for candidate in LIBREOFFICE_CANDIDATES:
        if candidate and os.path.exists(candidate):
            if candidate.lower().endswith('soffice.exe'):
                com_candidate = candidate[:-4] + '.com'
                if os.path.exists(com_candidate):
                    return com_candidate
            return candidate
    return None


def _color_int_to_rgb(color_value):
    try:
        if color_value is None:
            return RGBColor(0, 0, 0)
        if isinstance(color_value, str):
            color_value = color_value.lstrip('#')
            if len(color_value) == 6:
                return RGBColor.from_string(color_value.upper())
        if isinstance(color_value, int):
            hex_value = f'{color_value:06x}'
            return RGBColor.from_string(hex_value.upper())
    except Exception:
        pass
    return RGBColor(0, 0, 0)


def _guess_bold(font_name, flags):
    font_name = (font_name or '').lower()
    return 'bold' in font_name or 'black' in font_name or bool(flags & 16)


def _guess_italic(font_name, flags):
    font_name = (font_name or '').lower()
    return 'italic' in font_name or 'oblique' in font_name or bool(flags & 2)


def _detect_list_bullet(text):
    """Detect if text starts with a bullet or list marker."""
    stripped = text.lstrip()
    bullets = ['•', '○', '◦', '■', '□', '▪', '-', '+', '*']
    for bullet in bullets:
        if stripped.startswith(bullet):
            return True
    import re
    if re.match(r'^[\d]+[\.\)]', stripped):
        return True
    return False


def _is_table_row(lines, page_width):
    """Heuristic to detect if a group of lines forms a table row."""
    if len(lines) < 2:
        return False
    
    # Check if lines have similar y-coordinates (same row)
    y_values = [line.get('bbox', [0, 0, 0, 0])[1] for line in lines]
    y_range = max(y_values) - min(y_values)
    return y_range < page_width * 0.05


def convert_pdf_to_docx_custom(pdf_path):
    """Enhanced PDF to DOCX conversion with improved formatting, lists, and structure detection."""
    from docx.shared import Inches
    from docx.enum.text import WD_LINE_SPACING
    
    doc = Document()
    pdf = fitz.open(pdf_path)
    
    last_font_size = 11.0
    consecutive_small_text = 0

    for page_index, page in enumerate(pdf):
        if page_index > 0:
            doc.add_page_break()

        section = doc.sections[-1]
        section.page_width = Pt(page.rect.width)
        section.page_height = Pt(page.rect.height)
        section.top_margin = Pt(36)
        section.bottom_margin = Pt(36)
        section.left_margin = Pt(36)
        section.right_margin = Pt(36)

        text_dict = page.get_text('dict')
        blocks = text_dict.get('blocks', [])
        
        # Extract images from the page
        for img_index in range(len(page.get_images())):
            try:
                xref = page.get_images()[img_index]
                pix = fitz.Pixmap(pdf, xref)
                if pix.n - pix.alpha < 4:  # Gray or RGB
                    img_data = pix.tobytes('png')
                else:  # CMYK
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                    img_data = pix.tobytes('png')
                
                # Add image to document with reasonable sizing
                from io import BytesIO
                img_stream = BytesIO(img_data)
                if len(doc.paragraphs) > 0:
                    last_para = doc.paragraphs[-1]
                    run = last_para.add_run()
                    run.add_picture(img_stream, width=Inches(5.5))
            except Exception as e:
                print(f'Could not extract image from PDF: {e}')

        for block in blocks:
            if block.get('type') != 0:  # Skip non-text blocks
                continue

            lines = block.get('lines', [])
            if not lines:
                continue

            for line_index, line in enumerate(lines):
                spans = line.get('spans', [])
                if not spans:
                    continue

                text_line = ''.join(span.get('text', '') for span in spans).strip()
                if not text_line:
                    continue

                # Create paragraph with enhanced style detection
                paragraph = doc.add_paragraph()
                
                # Line positioning and alignment
                line_bbox = line.get('bbox', [0, 0, 0, 0])
                page_width = max(page.rect.width, 1)
                left_ratio = line_bbox[0] / page_width
                right_ratio = (page_width - line_bbox[2]) / page_width
                
                # Alignment detection
                if left_ratio < 0.08 and right_ratio < 0.08:
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                elif right_ratio < 0.12:
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                else:
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT

                # Enhanced heading and list detection
                max_size = max(span.get('size', 11) for span in spans)
                last_font_size = max_size
                
                # Detect headings based on size
                if max_size >= 24:
                    paragraph.style = 'Heading 1'
                    consecutive_small_text = 0
                elif max_size >= 18:
                    paragraph.style = 'Heading 2'
                    consecutive_small_text = 0
                elif max_size >= 14:
                    paragraph.style = 'Heading 3'
                    consecutive_small_text = 0
                elif _detect_list_bullet(text_line):
                    # List detection
                    paragraph.style = 'List Bullet'
                    paragraph.paragraph_format.left_indent = Pt(36)
                
                # Spacing based on context
                bbox = line.get('bbox', [0, 0, 0, 0])
                y0 = bbox[1] if len(bbox) > 1 else 0
                y1 = bbox[3] if len(bbox) > 3 else 0
                height = max(y1 - y0, 1)
                
                paragraph.paragraph_format.space_before = Pt(max(min(height * 0.15, 8), 2))
                paragraph.paragraph_format.space_after = Pt(max(min(height * 0.1, 6), 1))
                paragraph.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
                paragraph.paragraph_format.line_spacing = Pt(height * 1.1)

                # Add text with preserved formatting
                for span in spans:
                    text = span.get('text', '')
                    if not text:
                        continue

                    run = paragraph.add_run(text)
                    font_name = span.get('font', '')
                    flags = int(span.get('flags', 0) or 0)
                    size = float(span.get('size', 11) or 11)

                    # Font styling
                    run.font.size = Pt(size)
                    run.font.bold = _guess_bold(font_name, flags)
                    run.font.italic = _guess_italic(font_name, flags)
                    run.font.color.rgb = _color_int_to_rgb(span.get('color'))
                    
                    # Subscript/superscript detection based on rise
                    rise = span.get('origin', [0, 0])[1] if span.get('origin') else 0
                    if rise > height * 0.3:
                        run.font.superscript = True
                    elif rise < -height * 0.3:
                        run.font.subscript = True
                    
                    if font_name:
                        try:
                            run.font.name = font_name
                        except Exception:
                            pass  # Some font names may not be available

    # Clean up empty paragraphs
    for paragraph in doc.paragraphs[:]:
        if not paragraph.text.strip():
            p = paragraph._element
            p.getparent().remove(p)

    output = tempfile.NamedTemporaryFile(suffix='.docx', delete=False)
    output.close()
    try:
        doc.save(output.name)
        with open(output.name, 'rb') as f:
            docx_bytes = f.read()
        return base64.b64encode(docx_bytes).decode('utf-8')
    finally:
        pdf.close()
        try:
            os.remove(output.name)
        except Exception:
            pass


def convert_pptx_to_png_slides(pptx_path):
    """Convert PPTX to PNG images using LibreOffice -> PDF -> PNG pipeline."""
    libreoffice = find_libreoffice_executable()
    if not libreoffice:
        raise RuntimeError(
            'LibreOffice is not installed or not configured. Set LIBREOFFICE_PATH to soffice.exe.'
        )

    base_name = Path(pptx_path).stem
    work_dir = tempfile.mkdtemp(prefix='pptx_render_')
    pdf_path = os.path.join(work_dir, f'{base_name}.pdf')

    try:
        convert_cmd = [
            libreoffice,
            '--headless',
            '--nologo',
            '--nofirststartwizard',
            '--convert-to', 'pdf',
            '--outdir', work_dir,
            pptx_path,
        ]
        result = subprocess.run(convert_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or 'LibreOffice conversion failed')

        if not os.path.exists(pdf_path):
            # LibreOffice sometimes keeps the source filename; search for any pdf in output dir.
            pdf_candidates = list(Path(work_dir).glob('*.pdf'))
            if not pdf_candidates:
                raise RuntimeError('LibreOffice did not generate a PDF file.')
            pdf_path = str(pdf_candidates[0])

        slides = []
        pdf_doc = fitz.open(pdf_path)
        for page_index, page in enumerate(pdf_doc):
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
            png_bytes = pixmap.tobytes('png')
            png_base64 = base64.b64encode(png_bytes).decode('utf-8')
            slides.append({
                'id': f'slide-{page_index + 1}',
                'pageNumber': page_index + 1,
                'title': f'Slide {page_index + 1}',
                'imageData': f'data:image/png;base64,{png_base64}',
                'thumbnailData': f'data:image/png;base64,{png_base64}',
                'width': int(page.rect.width),
                'height': int(page.rect.height),
            })
        pdf_doc.close()
        return slides
    finally:
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass


def convert_pdf_to_docx(pdf_path):
    """Convert PDF to DOCX using pdf2docx first, then LibreOffice fallback."""
    # Preferred high-fidelity path: preserve text spans and colors from the PDF itself.
    try:
        return convert_pdf_to_docx_custom(pdf_path)
    except Exception as custom_error:
        print(f'Custom PDF->DOCX conversion failed, falling back to pdf2docx/LibreOffice: {custom_error}')

    work_dir = tempfile.mkdtemp(prefix='pdf_docx_')
    docx_path = os.path.join(work_dir, f'{Path(pdf_path).stem}.docx')

    fidelity_settings = {
        'ocr': 0,
        'ignore_page_error': True,
        'multi_processing': False,
        'cpu_count': 1,
        'min_section_height': 12.0,
        'page_margin_factor_top': 0.18,
        'page_margin_factor_bottom': 0.18,
        'shape_min_dimension': 2.0,
        'max_line_spacing_ratio': 1.35,
        'line_overlap_threshold': 0.92,
        'line_break_width_ratio': 0.68,
        'line_break_free_space_ratio': 0.08,
        'line_separate_threshold': 4.0,
        'new_paragraph_free_space_ratio': 0.72,
        'lines_left_aligned_threshold': 1.0,
        'lines_right_aligned_threshold': 1.0,
        'lines_center_aligned_threshold': 2.0,
        'clip_image_res_ratio': 4.0,
        'extract_stream_table': False,
        'parse_lattice_table': True,
        'parse_stream_table': True,
        'delete_end_line_hyphen': True,
        'raw_exceptions': False,
        'list_not_table': True,
    }

    # Higher-fidelity conversion path for selectable-text PDFs.
    if Converter is not None:
        try:
            cv = Converter(pdf_path)
            cv.convert(docx_path, start=0, end=None, **fidelity_settings)
            cv.close()
            with open(docx_path, 'rb') as f:
                docx_bytes = f.read()
            return base64.b64encode(docx_bytes).decode('utf-8')
        except Exception as pdf2docx_error:
            print(f'pdf2docx conversion failed, falling back to LibreOffice: {pdf2docx_error}')

    # Fallback path.
    libreoffice = find_libreoffice_executable()
    if not libreoffice:
        raise RuntimeError('LibreOffice is not installed or not configured. Set LIBREOFFICE_PATH to soffice.exe.')

    try:
        convert_cmd = [
            libreoffice,
            '--headless',
            '--nologo',
            '--nofirststartwizard',
            '--convert-to', 'docx:MS Word 2007 XML',
            '--infilter=writer_pdf_import',
            '--outdir', work_dir,
            pdf_path,
        ]
        result = subprocess.run(convert_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or 'LibreOffice PDF->DOCX conversion failed')

        candidates = list(Path(work_dir).glob('*.docx'))
        if not candidates:
            raise RuntimeError('LibreOffice did not generate a DOCX file from PDF.')

        docx_path = str(candidates[0])
        with open(docx_path, 'rb') as f:
            docx_bytes = f.read()

        return base64.b64encode(docx_bytes).decode('utf-8')
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

def extract_text_from_xml(text_body_elem):
    """Extract formatted text from PowerPoint text body element"""
    runs = []
    for paragraph in text_body_elem.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}p'):
        for text_run in paragraph.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}r'):
            text_elem = text_run.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}t')
            if text_elem is not None:
                text_content = text_elem.text or ''
                
                # Extract formatting
                run_props = text_run.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}rPr')
                bold = False
                italic = False
                color = None
                font_size = None
                
                if run_props is not None:
                    bold = run_props.get('b') == '1'
                    italic = run_props.get('i') == '1'
                    
                    # Font size in hundredths of a point
                    if 'sz' in run_props.attrib:
                        font_size = int(run_props.get('sz', 0)) / 100
                    
                    # Text color
                    solid_fill = run_props.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}solidFill')
                    if solid_fill is not None:
                        scheme_color = solid_fill.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}schemeClr')
                        srgb_color = solid_fill.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}srgbClr')
                        
                        if srgb_color is not None:
                            color = '#' + srgb_color.get('val', 'ffffff')
                        elif scheme_color is not None:
                            color_map = {
                                'lt1': '#ffffff',
                                'dk1': '#000000',
                                'accent1': '#0066cc',
                            }
                            color = color_map.get(scheme_color.get('val'), '#000000')
                
                runs.append({
                    'text': text_content,
                    'bold': bold,
                    'italic': italic,
                    'color': color,
                    'fontSize': font_size
                })
    
    return runs


def extract_shape_position(shape_elem, slide_width, slide_height):
    """Extract a shape's position and size in slide-relative percentages."""
    position = {
        'x': 0,
        'y': 0,
        'width': 100,
        'height': 20,
    }

    xfrm = shape_elem.find(f'.//{{{DRAW_NS}}}xfrm')
    if xfrm is None:
        return position

    off = xfrm.find(f'.//{{{DRAW_NS}}}off')
    ext = xfrm.find(f'.//{{{DRAW_NS}}}ext')

    if off is not None:
        position['x'] = round(emu_to_percent(off.get('x', 0), slide_width), 2)
        position['y'] = round(emu_to_percent(off.get('y', 0), slide_height), 2)

    if ext is not None:
        position['width'] = round(emu_to_percent(ext.get('cx', 0), slide_width), 2)
        position['height'] = round(emu_to_percent(ext.get('cy', 0), slide_height), 2)

    return position


def extract_text_runs(paragraph_elem):
    runs = []

    for text_run in paragraph_elem.findall(f'.//{{{DRAW_NS}}}r'):
        text_elem = text_run.find(f'.//{{{DRAW_NS}}}t')
        if text_elem is None:
            continue

        text_content = text_elem.text or ''
        if not text_content.strip():
            continue

        run_props = text_run.find(f'.//{{{DRAW_NS}}}rPr')
        bold = False
        italic = False
        color = '#000000'
        font_size = 18

        if run_props is not None:
            bold = run_props.get('b') == '1'
            italic = run_props.get('i') == '1'

            if 'sz' in run_props.attrib:
                try:
                    font_size = int(run_props.get('sz', 0)) / 100
                except Exception:
                    font_size = 18

            solid_fill = run_props.find(f'.//{{{DRAW_NS}}}solidFill')
            if solid_fill is not None:
                srgb_color = solid_fill.find(f'.//{{{DRAW_NS}}}srgbClr')
                if srgb_color is not None:
                    color = '#' + srgb_color.get('val', '000000')

        runs.append({
            'text': text_content,
            'bold': bold,
            'italic': italic,
            'color': color,
            'fontSize': font_size,
        })

    return runs

def parse_pptx(file_path):
    """Parse PPTX file and extract slides with formatted content"""
    slides = []
    
    try:
        with zipfile.ZipFile(file_path, 'r') as zip_ref:
            # Read slide dimensions from presentation.xml
            slide_width = 9144000
            slide_height = 5143500
            
            try:
                pres_xml = zip_ref.read('ppt/presentation.xml').decode('utf-8')
                pres_root = ET.fromstring(pres_xml)
                sld_sz = pres_root.find(f'.//{{{PML_NS}}}sldSz')
                if sld_sz is not None:
                    cx_val = sld_sz.get('cx')
                    cy_val = sld_sz.get('cy')
                    if cx_val and cy_val:
                        try:
                            slide_width = int(cx_val)
                            slide_height = int(cy_val)
                            print(f"Found slide dimensions: {slide_width} x {slide_height}")
                        except ValueError as e:
                            print(f"Could not parse slide dimensions: {e}")
            except Exception as e:
                print(f"Could not read presentation dimensions: {e}")
                pass
            
            # Get all slide files
            slide_files = [f for f in zip_ref.namelist() if f.startswith('ppt/slides/slide') and f.endswith('.xml')]
            slide_files.sort(key=lambda x: int(x.split('slide')[1].split('.')[0]))
            
            for slide_file in slide_files:
                try:
                    slide_num = slide_file.split('slide')[1].split('.')[0]
                    
                    # Read slide XML
                    slide_xml = zip_ref.read(slide_file).decode('utf-8')
                    slide_root = ET.fromstring(slide_xml)
                    
                    # Read slide relationships
                    rel_file = f'ppt/slides/_rels/slide{slide_num}.xml.rels'
                    relationships = {}
                    try:
                        rel_xml = zip_ref.read(rel_file).decode('utf-8')
                        rel_root = ET.fromstring(rel_xml)
                        for rel in rel_root.findall(f'.//{{{PKG_REL_NS}}}Relationship'):
                            rel_id = rel.get('Id')
                            target = rel.get('Target')
                            relationships[rel_id] = target
                    except:
                        pass
                    
                    # Extract text elements and positioned text boxes
                    text_elements = []
                    text_boxes = []
                    full_text = ''

                    for shape in slide_root.findall(f'.//{{{PML_NS}}}sp'):
                        text_body = shape.find(f'.//{{{PML_NS}}}txBody')
                        if text_body is None:
                            continue

                        position = extract_shape_position(shape, slide_width, slide_height)
                        paragraphs = text_body.findall(f'.//{{{DRAW_NS}}}p')

                        box_runs = []
                        alignment = 'l'
                        is_bullet = False
                        level = 0

                        is_title_shape = False
                        nv_props = shape.find(f'.//{{{PML_NS}}}nvSpPr')
                        if nv_props is not None:
                            ph = nv_props.find(f'.//{{{PML_NS}}}ph')
                            if ph is not None:
                                ph_type = ph.get('type', '')
                                is_title_shape = ph_type in ('title', 'ctrTitle', 'subTitle')

                        for para_index, para in enumerate(paragraphs):
                            runs = extract_text_runs(para)
                            if not runs:
                                continue

                            para_text = ''.join([r['text'] for r in runs])
                            if para_text.strip():
                                full_text += para_text + '\n'

                            ppr = para.find(f'.//{{{DRAW_NS}}}pPr')
                            if ppr is not None:
                                align_val = ppr.get('algn')
                                if align_val:
                                    alignment = align_val

                                if ppr.find(f'.//{{{DRAW_NS}}}buChar') is not None or ppr.find(f'.//{{{DRAW_NS}}}buFont') is not None:
                                    is_bullet = True

                                lvl_val = ppr.get('lvl')
                                if lvl_val is not None:
                                    try:
                                        level = int(lvl_val)
                                    except Exception:
                                        level = 0

                            box_runs.extend(runs)

                        if box_runs:
                            text_boxes.append({
                                'runs': box_runs,
                                'type': 'title' if is_title_shape and len(text_boxes) == 0 else 'body',
                                'level': level if is_bullet else None,
                                'isBullet': is_bullet,
                                'alignment': alignment,
                                'x': position['x'],
                                'y': position['y'],
                                'width': position['width'],
                                'height': position['height'],
                            })

                            text_elements.append({
                                'runs': box_runs,
                                'type': 'title' if is_title_shape and len(text_elements) == 0 else 'body',
                                'level': level if is_bullet else None,
                                'isBullet': is_bullet,
                                'alignment': alignment,
                            })
                    
                    # Extract images
                    images = []
                    for pic in slide_root.findall('.//{http://schemas.openxmlformats.org/presentationml/2006/main}pic'):
                        # Get relationship ID
                        blip = pic.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip')
                        if blip is not None:
                            embed = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                            
                            if embed and embed in relationships:
                                image_path = relationships[embed]
                                if image_path.startswith('../'):
                                    image_path = image_path[3:]
                                image_path = f'ppt/{image_path}'
                                
                                try:
                                    image_data = zip_ref.read(image_path)
                                    image_base64 = base64.b64encode(image_data).decode('utf-8')
                                    
                                    # Determine image format
                                    ext = Path(image_path).suffix.lower()
                                    mime_types = {
                                        '.png': 'png',
                                        '.jpg': 'jpeg',
                                        '.jpeg': 'jpeg',
                                        '.gif': 'gif',
                                        '.bmp': 'bmp',
                                    }
                                    mime = mime_types.get(ext, 'png')
                                    
                                    # Get position and size from xfrm
                                    xfrm = pic.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}xfrm')
                                    x, y, width, height = 0, 0, 15, 15
                                    
                                    if xfrm is not None:
                                        off = xfrm.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}off')
                                        ext_elem = xfrm.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}ext')
                                        
                                        if off is not None:
                                            x = (int(off.get('x', 0)) / slide_width) * 100
                                            y = (int(off.get('y', 0)) / slide_height) * 100
                                        
                                        if ext_elem is not None:
                                            width = (int(ext_elem.get('cx', 1000000)) / slide_width) * 100
                                            height = (int(ext_elem.get('cy', 1000000)) / slide_height) * 100
                                    
                                    images.append({
                                        'id': embed,
                                        'data': f'data:image/{mime};base64,{image_base64}',
                                        'x': round(x, 2),
                                        'y': round(y, 2),
                                        'width': round(width, 2),
                                        'height': round(height, 2)
                                    })
                                except Exception as e:
                                    print(f"Error loading image: {e}")
                    
                    # Get slide title
                    title = 'Slide ' + slide_num
                    if text_elements and text_elements[0]['runs']:
                        title = ''.join([r['text'] for r in text_elements[0]['runs']])[:50]
                    
                    slides.append({
                        'id': f'slide-{slide_num}',
                        'number': int(slide_num),
                        'title': title,
                        'textElements': text_elements,
                        'textBoxes': text_boxes,
                        'images': images,
                        'fullText': full_text,
                        'backgroundColor': '#ffffff',
                        'width': slide_width,
                        'height': slide_height
                    })
                
                except Exception as e:
                    print(f"Error parsing slide {slide_file}: {e}")
                    continue
        
        return slides
    
    except Exception as e:
        print(f"Error parsing PPTX: {e}")
        return []

@app.route('/api/upload-pptx', methods=['POST'])
def upload_pptx():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Only .pptx files are allowed'}), 400
        
        # Save temporarily using system temp directory
        filename = secure_filename(file.filename)
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, filename)
        
        print(f"Saving file to: {temp_path}")
        file.save(temp_path)
        
        # Verify file was saved
        if not os.path.exists(temp_path):
            return jsonify({'error': 'Failed to save uploaded file'}), 500
        
        file_size = os.path.getsize(temp_path)
        print(f"File saved, size: {file_size} bytes")
        
        render_mode = request.form.get('renderMode', 'pixel').lower()
        if render_mode == 'editable':
            slides = parse_pptx(temp_path)
        else:
            # Default: pixel-perfect rendering
            slides = convert_pptx_to_png_slides(temp_path)
        
        # Clean up
        try:
            os.remove(temp_path)
        except:
            pass
        
        return jsonify({
            'success': True,
            'slides': slides,
            'total': len(slides)
        }), 200
    
    except Exception as e:
        print(f"Upload error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/pdf-to-word', methods=['POST'])
def pdf_to_word():
    """
    Convert PDF to DOCX format with high-fidelity preservation of formatting.
    
    Request:
        - file (multipart/form-data): PDF file to convert
    
    Response (200):
        {
            "success": true,
            "docxBase64": "base64_encoded_docx_bytes",
            "docxFilename": "document.docx",
            "metadata": {
                "originalSize": 12345,
                "convertedSize": 54321,
                "pages": 5,
                "processTime": 2.34
            }
        }
    
    Response (400/500):
        {
            "success": false,
            "error": "Error message",
            "errorCode": "ERROR_CODE"
        }
    """
    import time
    start_time = time.time()
    
    try:
        # Validate request
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided in request',
                'errorCode': 'NO_FILE'
            }), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected',
                'errorCode': 'EMPTY_FILENAME'
            }), 400

        # Validate file extension
        ext = Path(file.filename).suffix.lower()
        if ext != '.pdf':
            return jsonify({
                'success': False,
                'error': f'Invalid file type: {ext}. Only .pdf files are supported.',
                'errorCode': 'INVALID_FILE_TYPE'
            }), 400
        
        # Validate file size (50MB max)
        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)
        
        if file_size > 50 * 1024 * 1024:
            return jsonify({
                'success': False,
                'error': 'File size exceeds 50MB limit',
                'errorCode': 'FILE_TOO_LARGE'
            }), 400
        
        if file_size == 0:
            return jsonify({
                'success': False,
                'error': 'File is empty',
                'errorCode': 'EMPTY_FILE'
            }), 400

        filename = secure_filename(file.filename)
        temp_dir = tempfile.gettempdir()
        temp_pdf_path = os.path.join(temp_dir, filename)

        # Save uploaded file
        try:
            file.save(temp_pdf_path)
        except Exception as save_error:
            return jsonify({
                'success': False,
                'error': f'Failed to save uploaded file: {str(save_error)}',
                'errorCode': 'SAVE_ERROR'
            }), 500
        
        if not os.path.exists(temp_pdf_path):
            return jsonify({
                'success': False,
                'error': 'Failed to save uploaded PDF',
                'errorCode': 'SAVE_VERIFY_ERROR'
            }), 500

        try:
            # Perform conversion
            docx_base64 = convert_pdf_to_docx(temp_pdf_path)
            
            # Calculate conversion metrics
            process_time = time.time() - start_time
            
            # Decode to get actual size
            docx_bytes = base64.b64decode(docx_base64)
            
            # Extract page count from PDF
            try:
                pdf_doc = fitz.open(temp_pdf_path)
                page_count = len(pdf_doc)
                pdf_doc.close()
            except Exception:
                page_count = 0
            
            response_data = {
                'success': True,
                'docxBase64': docx_base64,
                'docxFilename': Path(file.filename).stem + '.docx',
                'metadata': {
                    'originalSize': file_size,
                    'convertedSize': len(docx_bytes),
                    'pages': page_count,
                    'processTime': round(process_time, 2)
                }
            }
            
            return jsonify(response_data), 200
            
        except RuntimeError as runtime_error:
            print(f"PDF->Word conversion runtime error: {runtime_error}")
            return jsonify({
                'success': False,
                'error': f'Conversion failed: {str(runtime_error)}',
                'errorCode': 'CONVERSION_ERROR'
            }), 500
        except Exception as conversion_error:
            print(f"PDF->Word conversion error: {conversion_error}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': 'An unexpected error occurred during conversion. Check server logs for details.',
                'errorCode': 'UNEXPECTED_ERROR'
            }), 500
        finally:
            # Clean up temporary PDF
            try:
                if os.path.exists(temp_pdf_path):
                    os.remove(temp_pdf_path)
            except Exception as cleanup_error:
                print(f"Warning: Could not clean up temp file {temp_pdf_path}: {cleanup_error}")
    
    except Exception as e:
        print(f"PDF->Word request handler error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Server error processing request',
            'errorCode': 'REQUEST_ERROR'
        }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)
