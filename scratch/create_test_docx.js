import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import fs from "fs";

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          text: "Rapport de Projet Informatique - Innovega",
          heading: HeadingLevel.TITLE,
        }),
        new Paragraph({
          text: "Ce document de démonstration contient une arborescence complète de titres et chapitres pour tester la génération du Sommaire automatique.",
        }),
        new Paragraph({
          text: "1. Introduction et Contexte Général",
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          text: "Le projet Innovega vise à développer un système intelligent d'irrigation et de télémétrie en temps réel pour l'agriculture connectée. La plateforme regroupe des capteurs IoT, une application mobile Flutter et un backend haute performance.",
        }),
        new Paragraph({
          text: "1.1 Problématique et Enjeux",
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph({
          text: "La gestion optimale des ressources en eau constitue un défi majeur. L'automatisation basée sur des seuils d'humidité permet de réduire le gaspillage jusqu'à 35%.",
        }),
        new Paragraph({
          text: "1.2 Périmètre du Projet",
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph({
          text: "Le périmètre inclut la surveillance en temps réel, le contrôle à distance des vannes et le suivi des alertes météo.",
        }),
        new Paragraph({
          text: "2. Architecture Technique et Composants",
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          text: "L'architecture repose sur un modèle distribué garantissant une haute disponibilité et une faible latence.",
        }),
        new Paragraph({
          text: "2.1 Application Mobile Flutter",
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph({
          text: "L'application mobile permet aux agriculteurs de visualiser l'état des parcelles, de recevoir des notifications instantanées et de commander l'ouverture/fermeture des vannes.",
        }),
        new Paragraph({
          text: "2.2 Backend NestJS et WebSockets",
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph({
          text: "Le serveur central traite les flux de données télémétriques diffusés via Socket.io et gère les autorisations JWT.",
        }),
        new Paragraph({
          text: "2.3 Passerelles IoT et Capteurs Field",
          heading: HeadingLevel.HEADING_3,
        }),
        new Paragraph({
          text: "Les sous-stations acquièrent la température, l'humidité du sol et la pression d'eau toutes les 5 secondes.",
        }),
        new Paragraph({
          text: "3. Résultats et Performances",
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          text: "Les tests d'intégration ont démontré une excellente réactivité du système avec un temps de réponse moyen inférieur à 120ms.",
        }),
        new Paragraph({
          text: "4. Conclusion et Perspectives Futures",
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          text: "La première version d'Innovega valide l'ensemble des exigences fonctionnelles. Les futures évolutions intégreront un modèle d'IA prédictif pour l'irrigation autonome.",
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("test_document_titres.docx", buffer);
  console.log("Document test_document_titres.docx créé avec succès !");
});
