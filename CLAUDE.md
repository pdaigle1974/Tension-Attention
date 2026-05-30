# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This is a **project specification** for a mobile blood pressure tracking app, intended for use on iPhone. No code exists yet — the repository contains only source assets and the requirements document.

**Source assets:**
- `instructions.odt` — full requirements in French
- `gabarit_tension.jpeg` — the official Quebec RAMQ blood pressure monitoring form that the app must replicate (patient: Pascal Daigle, DON: (DDN supprimée), dossier HHQ7380)
- `exemple_lecture_tensiometre.jpeg` — sample photo of a LifeSource UA-1020CN blood pressure monitor, showing the OCR input the app will receive (SYS / DIA / pulse readings)

## Requirements summary

**Core flow:** User photographs the blood pressure monitor display → app uses OCR/vision to extract SYS, DIA, and pulse values → values are auto-entered into the tracking form → date/time are set automatically to Eastern Time (Quebec).

**Data fields** (matching the RAMQ gabarit form):
- Patient header info (pre-filled): name, DON, dossier #, physician, address, phone
- Per-reading: Date, Heure, SYS (mmHg), DIA (mmHg), Pouls (bpm), État (texte libre), Médicaments (texte libre)
- Les colonnes État et Médicaments sont saisies manuellement au clavier (pas extraites par OCR)

**Color coding against target (130/80 mmHg):**
- Vert : SYS ≤ 130 ET DIA ≤ 80
- Jaune : dépassement modéré
- Rouge : dépassement significatif

**Export PDF :**
- Par défaut : toutes les lectures depuis le début
- Option : sélectionner une période précise
- Livraison par courriel (adresse choisie manuellement à chaque envoi)

**Utilisation :** 2 lectures par jour (matin/soir) — la date et l'heure distinguent chaque entrée naturellement.

**Hors-ligne :** l'app doit fonctionner sans connexion (sauf pour l'OCR).

**Utilisateurs :** usage solo pour l'instant, avec possibilité future de partager avec la conjointe.

**Si l'OCR échoue :** proposer les deux options — reprendre la photo ou saisir manuellement.

**OCR — valeurs réelles de la photo exemple :** SYS 143, DIA 106, Pouls 75 (photo prise à l'endroit).

**Platform :** iPhone (application web / PWA accessible depuis Safari).

**Constructeur :** Claude Code (à construire dans ce dépôt).
