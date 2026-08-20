import os
from pathlib import Path

os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')
os.environ.setdefault('OMP_NUM_THREADS', '1')

from huggingface_hub import snapshot_download


def main():
    model_id = os.environ.get('LOCAL_TRANSCRIBE_MODEL_ID', 'Systran/faster-whisper-tiny')
    models_dir = Path(__file__).resolve().parent / 'models'
    models_dir.mkdir(parents=True, exist_ok=True)

    local_path = snapshot_download(
        repo_id=model_id,
        local_dir=models_dir / model_id.split('/')[-1],
        local_dir_use_symlinks=False,
    )

    print(f'Model downloaded to: {local_path}')
    print(f'PowerShell:')
    print(f'$env:LOCAL_TRANSCRIBE_MODEL="{local_path}"')
    print('python backend/app.py')


if __name__ == '__main__':
    main()
