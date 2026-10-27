#!/usr/bin/env python3
"""Novaula · correzione delle consegne con Claude.

Claude legge le consegne (PDF o foto), decide cosa è giusto e cosa è sbagliato e scrive un
file correzione.json; questo script disegna il PDF corretto (verde = giusto, rosso = sbagliato,
arancio = parziale) con le note a margine e una pagina di riepilogo, poi lo carica su Novaula,
dove il docente lo vede in Area docente e sotto le consegne del compito.

Comandi
  scarica --classe 5g --compito "startup" [--dir lavoro] [--tutte]
      scarica le consegne non ancora corrette (con --tutte anche quelle già corrette)
      in <dir>/<classe>-<compito>/: un PDF per consegna, la traccia del compito e manifest.json
  scarica --nuove [--dir lavoro]
      per la correzione automatica: tutte le consegne nuove di tutte le classi (senza correzione,
      non saltate, non "da rifare", compito con correzione automatica attiva); se non ce ne sono
      scrive "Nessuna consegna nuova." ed esce con codice 0
  pagine FILE.pdf [--out DIR]
      immagini PNG delle pagine con la griglia 0-1 (per scegliere i riquadri) e il testo
      di ogni riga con la sua posizione, così Claude può segnare per "testo" o per "riquadro"
  annota FILE.pdf correzione.json [-o corretto.pdf]
      crea il PDF corretto
  carica correzione.json [--pdf corretto.pdf] [--automatica]
      invia il PDF corretto e il riepilogo a Novaula (serve submission_id nel JSON);
      con --automatica la correzione è segnata "automatica" e non sostituisce mai una già esistente
  salta SUBMISSION_ID "motivo"
      la consegna non si può correggere in automatico: non verrà più riproposta e il docente
      vede il motivo in Area docente (con "Riprova" la rimette in coda)
  scansioni [--dir lavoro]
      verifiche su carta scansionate dal docente (Piano valutazioni → Posta in arrivo): per ognuna
      scarica in <dir>/scan-<id>/ la scansione in PDF, testo e soluzioni della verifica e manifest.json
      con l'elenco della classe e il codice stampato su ogni copia; se non ce ne sono scrive
      "Nessuna scansione nuova."
  dividi <dir>/scan-<id>/manifest.json divisione.json
      divisione.json = {"copie": [{"student_id": "...", "pagine": [1, 2]}], "non_assegnate": [5],
      "nota": "facoltativa"}; ogni copia diventa la consegna dello studente (compito nascosto della
      verifica) e la scansione si chiude: poi «scarica --nuove» la propone per la correzione normale
  scansione-errore SCAN_ID "motivo"
      la scansione non si può dividere (illeggibile, verifica sbagliata): il docente vede il motivo

correzione.json
  {"studente": "Mario Rossi", "classe": "5G", "compito": "Backlog e sprint plan",
   "submission_id": "uuid della consegna (lo mette scarica)",
   "voto": "7", "sintesi": "Due o tre frasi per il docente.",
   "note_generali": ["facoltative, in prima pagina"],
   "segni": [
     {"pagina": 1, "esito": "giusto", "testo": "frase da cercare nel PDF", "nota": "Corretto."},
     {"pagina": 2, "esito": "sbagliato", "riquadro": [0.1, 0.42, 0.9, 0.5], "nota": "Manca la stima."},
     {"pagina": 2, "esito": "parziale", "testo": "Sprint 1", "occorrenza": 2, "nota": "..."}]}
  "riquadro" usa frazioni della pagina (x0, y0, x1, y1), come la griglia di "pagine".
  Se c'è "testo" e non si trova, si usa "riquadro"; se manca anche quello la nota va in cima.

Variabili d'ambiente: NOVAULA_TOKEN (private_settings.marking_token), NOVAULA_URL (facoltativa).
Richiede PyMuPDF: python3 -m pip install pymupdf
"""
import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

import pymupdf

SUPABASE = os.environ.get("NOVAULA_SUPABASE", "https://pplpkabznbihovqwzenq.supabase.co")
SITO = os.environ.get("NOVAULA_URL", "https://novaula.netlify.app")
FUNZIONE = SUPABASE + "/functions/v1/correzioni"

COLORI = {
    "giusto": ((0.13, 0.62, 0.30), "Giusto"),
    "sbagliato": ((0.85, 0.15, 0.15), "Sbagliato"),
    "parziale": ((0.93, 0.55, 0.05), "Parziale"),
}
INCHIOSTRO = (0.10, 0.16, 0.36)
GRIGIO = (0.40, 0.42, 0.48)
FONT_FILES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf"]
FONT_BOLD_FILES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"]


def esito(s):
    s = (s or "").lower()
    if s.startswith(("giust", "corrett", "ok", "right", "correct")):
        return "giusto"
    if s.startswith(("parz", "partial", "quasi")):
        return "parziale"
    return "sbagliato"


# ---------------------------------------------------------------- rete

def chiama(op, **dati):
    token = os.environ.get("NOVAULA_TOKEN")
    if not token:
        sys.exit("Manca NOVAULA_TOKEN (select value from private_settings where key = 'marking_token').")
    req = urllib.request.Request(FUNZIONE, data=json.dumps(dict(op=op, **dati)).encode(),
                                 headers={"Content-Type": "application/json", "x-novaula-token": token})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Novaula ha risposto {e.code}: {e.read().decode(errors='replace')}")


def scarica_url(url, dest):
    with urllib.request.urlopen(url, timeout=120) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40] or "x"


def in_pdf(src, dest):
    """Porta una consegna in PDF: i PDF restano uguali, le immagini diventano una pagina,
    i documenti d'ufficio passano da LibreOffice se c'è."""
    ext = os.path.splitext(src)[1].lower()
    if ext == ".pdf":
        shutil.copy(src, dest)
        return True
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic"):
        img = pymupdf.open(src)
        pdf = pymupdf.open("pdf", img.convert_to_pdf())
        pdf.save(dest)
        return True
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if soffice and ext in (".doc", ".docx", ".odt", ".rtf", ".ppt", ".pptx", ".odp", ".xls", ".xlsx", ".ods", ".txt"):
        out = tempfile.mkdtemp()
        subprocess.run([soffice, "--headless", "--convert-to", "pdf", "--outdir", out, src],
                       capture_output=True, timeout=180)
        made = [f for f in os.listdir(out) if f.endswith(".pdf")]
        if made:
            shutil.move(os.path.join(out, made[0]), dest)
            return True
    return False


def nota_in_pdf(testo, dest, studente):
    """Una consegna fatta solo di testo (la nota) diventa un PDF da correggere."""
    doc = pymupdf.open()
    page = doc.new_page()
    p = Penna(page)
    y = p.scrivi(50, 40, f"Consegna di {studente} (testo scritto nella nota)", 11, 495, GRIGIO, bold=True)
    for par in str(testo).split("\n"):
        if y > 790:
            page = doc.new_page()
            p = Penna(page)
            y = 40
        y = p.scrivi(50, y + 4, par or " ", 10.5, 495)
    doc.save(dest)


def cmd_scarica(a):
    compiti = chiama("consegne", classe=a.classe, compito=a.compito, assignment_id=a.id, nuove=a.nuove)
    if not compiti:
        if a.nuove:
            print("Nessuna consegna nuova.")
            return
        sys.exit("Nessun compito con consegne trovato.")
    for c in compiti:
        cartella = os.path.join(a.dir, f"{c['class_id']}-{slug(c['title'])}")
        os.makedirs(os.path.join(cartella, "originali"), exist_ok=True)
        if c.get("pdf_url"):
            url = c["pdf_url"] if c["pdf_url"].startswith("http") else SITO + "/" + c["pdf_url"].lstrip("/")
            try:
                scarica_url(url, os.path.join(cartella, "traccia.pdf"))
            except Exception as e:
                print(f"  traccia non scaricata ({e})")
        voci = []
        for s in c["submissions"]:
            if s.get("corrected_at") and not a.tutte:
                continue
            voce = {k: s.get(k) for k in ("id", "student_name", "note", "file_name", "created_at", "corrected_at")}
            nome = f"{slug(s['student_name'])}-{s['id'][:8]}"
            multi = [f for f in (s.get("files") or []) if f.get("url")]
            if len(multi) > 1:
                # più file (es. foto): ognuno in PDF, poi un solo PDF con tutte le pagine in ordine
                pdf = os.path.join(cartella, nome + ".pdf")
                unito, illeggibili, originali = pymupdf.open(), [], []
                for i, f in enumerate(multi, 1):
                    ext = os.path.splitext(f.get("name") or "")[1].lower() or ".pdf"
                    orig = os.path.join(cartella, "originali", f"{nome}-{i}{ext}")
                    scarica_url(f["url"], orig)
                    originali.append(os.path.relpath(orig, cartella))
                    parte = orig + ".pdf"
                    if in_pdf(orig, parte):
                        unito.insert_pdf(pymupdf.open(parte))
                    else:
                        illeggibili.append(f.get("name") or orig)
                if len(unito):
                    unito.save(pdf)
                voce["pdf"] = os.path.basename(pdf) if len(unito) else None
                voce["originale"] = originali
                if illeggibili:
                    voce["file_non_leggibili"] = illeggibili
            elif s.get("url"):
                ext = os.path.splitext(s.get("file_name") or "")[1] or ".pdf"
                orig = os.path.join(cartella, "originali", nome + ext.lower())
                scarica_url(s["url"], orig)
                pdf = os.path.join(cartella, nome + ".pdf")
                voce["pdf"] = os.path.basename(pdf) if in_pdf(orig, pdf) else None
                voce["originale"] = os.path.relpath(orig, cartella)
            elif (s.get("note") or "").strip():
                pdf = os.path.join(cartella, nome + ".pdf")
                nota_in_pdf(s["note"], pdf, s["student_name"])
                voce["pdf"] = os.path.basename(pdf)
                voce["solo_nota"] = True
            else:
                voce["pdf"] = None
            voci.append(voce)
        manifest = {k: c.get(k) for k in ("id", "class_id", "title", "description", "pdf_url", "due_date", "kind", "group_work")}
        manifest["consegne"] = voci
        with open(os.path.join(cartella, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        print(f"{c['class_id'].upper()} · {c['title']}: {len(voci)} consegne da correggere in {cartella}")
        for v in voci:
            print(f"  {v['student_name']}: {v.get('pdf') or 'formato non leggibile: ' + str(v.get('originale'))}")


# ---------------------------------------------------------------- pagine

def cmd_pagine(a):
    doc = pymupdf.open(a.pdf)
    out = a.out or os.path.splitext(a.pdf)[0] + "-pagine"
    os.makedirs(out, exist_ok=True)
    for i, p in enumerate(doc, 1):
        w, h = p.rect.width, p.rect.height
        pix = p.get_pixmap(dpi=a.dpi)
        img = pymupdf.open()
        pg = img.new_page(width=w, height=h)
        pg.insert_image(pg.rect, pixmap=pix)
        for k in range(1, 10):
            x, y = w * k / 10, h * k / 10
            pg.draw_line((x, 0), (x, h), color=(0.2, 0.4, 1), width=0.4, stroke_opacity=0.5)
            pg.draw_line((0, y), (w, y), color=(0.2, 0.4, 1), width=0.4, stroke_opacity=0.5)
            pg.insert_text((x + 2, 9), f"{k/10:.1f}", fontsize=7, color=(0.1, 0.3, 1))
            pg.insert_text((2, y - 2), f"{k/10:.1f}", fontsize=7, color=(0.1, 0.3, 1))
        pg.get_pixmap(dpi=a.dpi).save(os.path.join(out, f"pagina-{i}.png"))
        print(f"--- pagina {i} ({os.path.join(out, f'pagina-{i}.png')})")
        for b in p.get_text("dict")["blocks"]:
            for line in b.get("lines", []):
                t = "".join(s["text"] for s in line["spans"]).strip()
                if t:
                    x0, y0, x1, y1 = line["bbox"]
                    print(f"  [{x0/w:.2f},{y0/h:.2f},{x1/w:.2f},{y1/h:.2f}] {t}")
    if not any(p.get_text().strip() for p in doc):
        print("(nessun testo: è una scansione o una foto, usare i riquadri guardando le immagini)")


# ---------------------------------------------------------------- annota

class Penna:
    def __init__(self, page):
        self.page = page
        self.reg = self._font(page, "nv", FONT_FILES, "helv")
        self.bold = self._font(page, "nvb", FONT_BOLD_FILES, "hebo")

    @staticmethod
    def _font(page, name, files, fallback):
        for f in files:
            if os.path.exists(f):
                page.insert_font(fontname=name, fontfile=f)
                return (name, pymupdf.Font(fontfile=f))
        return (fallback, pymupdf.Font(fallback))

    def righe(self, testo, size, larghezza, bold=False):
        font = (self.bold if bold else self.reg)[1]
        out = []
        for par in str(testo).split("\n"):
            riga = ""
            for parola in par.split():
                prova = (riga + " " + parola).strip()
                if font.text_length(prova, fontsize=size) <= larghezza or not riga:
                    riga = prova
                else:
                    out.append(riga)
                    riga = parola
            out.append(riga)
        return out

    def scrivi(self, x, y, testo, size=9, larghezza=200, colore=INCHIOSTRO, bold=False, interlinea=1.3):
        nome = (self.bold if bold else self.reg)[0]
        for r in self.righe(testo, size, larghezza, bold):
            y += size * interlinea
            self.page.insert_text((x, y - size * 0.25), r, fontname=nome, fontsize=size, color=colore)
        return y

    def altezza(self, testo, size, larghezza, bold=False, interlinea=1.3):
        return len(self.righe(testo, size, larghezza, bold)) * size * interlinea


def trova(page, segno):
    r = page.rect
    testo = (segno.get("testo") or "").strip()
    if testo:
        hits = page.search_for(testo)
        if not hits and len(testo) > 40:
            hits = page.search_for(testo[:40])
        if hits:
            n = max(1, int(segno.get("occorrenza", 1)))
            primo = hits[min(n, len(hits)) - 1]
            # una frase su più righe: unisce i rettangoli consecutivi della stessa occorrenza
            rett = [primo]
            for h in hits[hits.index(primo) + 1:]:
                if h.y0 - rett[-1].y1 < primo.height * 0.8 and h.y0 > rett[-1].y0:
                    rett.append(h)
                else:
                    break
            return rett
    q = segno.get("riquadro")
    if q and len(q) == 4:
        x0, y0, x1, y1 = [float(v) for v in q]
        return [pymupdf.Rect(x0 * r.width, y0 * r.height, x1 * r.width, y1 * r.height)]
    return []


def badge(page, penna, centro, n, colore, raggio=7):
    page.draw_circle(centro, raggio, color=None, fill=colore)
    s = str(n)
    size = 8 if len(s) < 3 else 6.5
    w = penna.bold[1].text_length(s, fontsize=size)
    page.insert_text((centro.x - w / 2, centro.y + size * 0.36), s, fontname=penna.bold[0], fontsize=size, color=(1, 1, 1))


def copertina(out, dati, segni, w, h):
    page = out.new_page(width=w, height=h)
    p = Penna(page)
    m = 42
    larg = w - 2 * m
    page.draw_rect(pymupdf.Rect(0, 0, w, 6), color=None, fill=INCHIOSTRO)
    y = p.scrivi(m, m, "Correzione automatica · da controllare", 9, larg, GRIGIO)
    y = p.scrivi(m, y + 4, dati.get("studente") or "Consegna", 22, larg, INCHIOSTRO, bold=True)
    sotto = " · ".join(x for x in [dati.get("classe"), dati.get("compito")] if x)
    if sotto:
        y = p.scrivi(m, y + 2, sotto, 11, larg, GRIGIO)
    y += 16
    conta = {k: sum(1 for s in segni if s["esito"] == k) for k in COLORI}
    x = m
    for k in ("giusto", "parziale", "sbagliato"):
        col, nome = COLORI[k]
        box = pymupdf.Rect(x, y, x + 110, y + 50)
        page.draw_rect(box, color=col, fill=col, fill_opacity=0.12, width=1.2)
        page.insert_text((x + 10, y + 27), str(conta[k]), fontname=p.bold[0], fontsize=20, color=col)
        page.insert_text((x + 10, y + 42), nome, fontname=p.reg[0], fontsize=9, color=col)
        x += 120
    if dati.get("voto"):
        box = pymupdf.Rect(x, y, w - m, y + 50)
        page.draw_rect(box, color=INCHIOSTRO, fill=(1, 0.93, 0.45), width=1.2)
        page.insert_text((x + 10, y + 27), str(dati["voto"]), fontname=p.bold[0], fontsize=20, color=INCHIOSTRO)
        page.insert_text((x + 10, y + 42), "Voto proposto", fontname=p.reg[0], fontsize=9, color=INCHIOSTRO)
    y += 70
    if dati.get("sintesi"):
        y = p.scrivi(m, y, "Sintesi", 12, larg, INCHIOSTRO, bold=True)
        y = p.scrivi(m, y + 2, dati["sintesi"], 10.5, larg, INCHIOSTRO, interlinea=1.4) + 10
    for nota in dati.get("note_generali") or []:
        y = p.scrivi(m + 10, y, "• " + nota, 10, larg - 10, INCHIOSTRO) + 2
    if segni:
        y = p.scrivi(m, y + 10, "Punti segnati", 12, larg, INCHIOSTRO, bold=True) + 4
        for s in segni:
            col = COLORI[s["esito"]][0]
            testo = f"p. {s['pagina']} · {COLORI[s['esito']][1]}" + (f": {s['nota']}" if s.get("nota") else "")
            alt = p.altezza(testo, 9.5, larg - 24)
            if y + alt > h - m - 20:
                page.insert_text((m, h - m), "… continua nelle pagine annotate", fontname=p.reg[0], fontsize=9, color=GRIGIO)
                break
            badge(page, p, pymupdf.Point(m + 7, y + 8), s["n"], col)
            y = p.scrivi(m + 22, y, testo, 9.5, larg - 24, INCHIOSTRO) + 4
    page.insert_text((m, h - 24), "Verde = giusto · arancio = parziale · rosso = sbagliato. Proposta di Claude: il voto finale è del docente.",
                     fontname=p.reg[0], fontsize=8, color=GRIGIO)


def cmd_annota(a):
    with open(a.json, encoding="utf-8") as f:
        dati = json.load(f)
    src = pymupdf.open(a.pdf)
    segni = []
    for s in dati.get("segni", []):
        s = dict(s)
        s["esito"] = esito(s.get("esito"))
        s["pagina"] = min(max(1, int(s.get("pagina", 1))), len(src))
        segni.append(s)
    segni.sort(key=lambda s: s["pagina"])
    for i, s in enumerate(segni, 1):
        s["n"] = i

    out = pymupdf.open()
    w0, h0 = src[0].rect.width, src[0].rect.height
    copertina(out, dati, segni, max(w0, 595), max(h0, 842) if h0 >= w0 else 595)

    for pno, sp in enumerate(src, 1):
        w, h = sp.rect.width, sp.rect.height
        marg = max(170, w * 0.42)
        page = out.new_page(width=w + marg, height=h)
        page.show_pdf_page(pymupdf.Rect(0, 0, w, h), src, pno - 1)
        page.draw_rect(pymupdf.Rect(w, 0, w + marg, h), color=None, fill=(0.97, 0.97, 0.95))
        page.draw_line((w, 0), (w, h), color=(0.8, 0.8, 0.8), width=0.6)
        p = Penna(page)
        qui = [s for s in segni if s["pagina"] == pno]
        posti = []
        for s in qui:
            col = COLORI[s["esito"]][0]
            rett = trova(sp, s)
            if rett:
                for r in rett:
                    r = r + (-2, -1, 2, 1)
                    page.draw_rect(r, color=col, fill=col, fill_opacity=0.18, width=1.3)
                ancora = rett[0]
                punto = pymupdf.Point(min(w - 8, max(r.x1 for r in rett) + 11), ancora.y0 + (ancora.height / 2 if len(rett) == 1 else 6))
                badge(page, p, punto, s["n"], col)
                posti.append((s, ancora.y0, punto + (7, 0)))
            else:
                posti.append((s, 0, None))
        # note a margine, in ordine verticale, senza sovrapporsi
        posti.sort(key=lambda t: t[1])
        y = 14
        larg = marg - 34
        page.insert_text((w + 12, 14), f"Pagina {pno} · {len(qui)} segni" if qui else f"Pagina {pno}",
                         fontname=p.reg[0], fontsize=8, color=GRIGIO)
        y = 22
        for s, yy, punto in posti:
            col, nome = COLORI[s["esito"]]
            testo = s.get("nota") or nome
            alt = p.altezza(testo, 9, larg) + 22
            y = max(y, yy - 4)
            if y + alt > h - 6:
                y = max(22, h - 6 - alt)
            box = pymupdf.Rect(w + 8, y, w + marg - 8, y + alt)
            page.draw_rect(box, color=col, fill=(1, 1, 1), width=0.8)
            page.draw_rect(pymupdf.Rect(box.x0, box.y0, box.x0 + 3, box.y1), color=None, fill=col)
            badge(page, p, pymupdf.Point(box.x0 + 14, box.y0 + 10), s["n"], col, 6.5)
            page.insert_text((box.x0 + 24, box.y0 + 13), nome, fontname=p.bold[0], fontsize=8.5, color=col)
            p.scrivi(box.x0 + 10, box.y0 + 18, testo, 9, larg, INCHIOSTRO)
            if punto is not None:
                page.draw_line(punto, (w + 8, box.y0 + 10), color=col, width=0.7, stroke_opacity=0.6, dashes="[2 2] 0")
            y = box.y1 + 6
    dest = a.o or os.path.splitext(a.pdf)[0] + "-corretto.pdf"
    out.set_metadata({"title": f"Correzione · {dati.get('studente', '')}", "author": "Novaula · Claude"})
    out.save(dest, garbage=3, deflate=True)
    print(f"{dest} ({len(segni)} segni: " + ", ".join(f"{sum(1 for s in segni if s['esito'] == k)} {k}" for k in COLORI) + ")")
    return dest


# ---------------------------------------------------------------- carica

def cmd_carica(a):
    with open(a.json, encoding="utf-8") as f:
        dati = json.load(f)
    pdf = a.pdf or dati.get("pdf_corretto")
    if not pdf:
        sys.exit("Indica il PDF corretto con --pdf.")
    if not dati.get("submission_id"):
        sys.exit("Nel JSON manca submission_id.")
    segni = [esito(s.get("esito")) for s in dati.get("segni", [])]
    with open(pdf, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    r = chiama("salva", submission_id=dati["submission_id"], pdf_base64=b64, grade=dati.get("voto"),
               summary=dati.get("sintesi"), correct=segni.count("giusto"), wrong=segni.count("sbagliato"),
               partial=segni.count("parziale"), automatica=a.automatica)
    if r.get("gia_corretta"):
        print(f"Già corretta, lasciata com'è: {dati.get('studente')}")
        return
    print(f"Caricata: {dati.get('studente')} → {r.get('file_path')}")


def cmd_salta(a):
    chiama("salta", submission_id=a.submission_id, motivo=a.motivo)
    print(f"Saltata: {a.submission_id} ({a.motivo})")


def codice(student_id):
    """Codice stampato su ogni pagina della copia di uno studente (uguale a valutazioni.js)."""
    return student_id.replace("-", "")[:4].upper()


def cmd_scansioni(a):
    lista = chiama("scansioni")
    if not lista:
        print("Nessuna scansione nuova.")
        return
    for sc in lista:
        cartella = os.path.join(a.dir, f"scan-{sc['id'][:8]}")
        os.makedirs(cartella, exist_ok=True)
        ext = os.path.splitext(sc.get("file_name") or sc["file_path"])[1].lower() or ".pdf"
        orig = os.path.join(cartella, "originale" + ext)
        scarica_url(sc["url"], orig)
        pdf = os.path.join(cartella, "scansione.pdf")
        letto = in_pdf(orig, pdf)
        t = sc["test"]
        for chiave, nome in (("test_url", "verifica.pdf"), ("solutions_url", "soluzioni.pdf")):
            if t.get(chiave):
                url = t[chiave] if t[chiave].startswith("http") else SITO + "/" + t[chiave].lstrip("/")
                try:
                    scarica_url(url, os.path.join(cartella, nome))
                except Exception as e:
                    print(f"  {nome} non scaricato ({e})")
        studenti = [dict(s, codice=codice(s["id"])) for s in sc.get("students") or []]
        doppi = sorted({s["codice"] for s in studenti if sum(x["codice"] == s["codice"] for x in studenti) > 1})
        pagine = pymupdf.open(pdf).page_count if letto else 0
        manifest = {"scan_id": sc["id"], "classe": sc["class_name"], "class_id": sc["class_id"], "verifica": t,
                    "file_name": sc.get("file_name"), "pdf": "scansione.pdf" if letto else None, "pagine": pagine,
                    "studenti": studenti, "codici_doppi": doppi}
        with open(os.path.join(cartella, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        print(f"{cartella}: {sc['class_name']} · {t['title']} · {pagine} pagine · {len(studenti)} studenti")


def cmd_dividi(a):
    with open(a.manifest, encoding="utf-8") as f:
        m = json.load(f)
    with open(a.json, encoding="utf-8") as f:
        d = json.load(f)
    src = pymupdf.open(os.path.join(os.path.dirname(a.manifest), m["pdf"]))
    ok = 0
    for c in d.get("copie", []):
        pagine = [p for p in c.get("pagine", []) if 1 <= p <= src.page_count]
        if not pagine:
            continue
        doc = pymupdf.open()
        for p in pagine:
            doc.insert_pdf(src, from_page=p - 1, to_page=p - 1)
        b64 = base64.b64encode(doc.tobytes(garbage=3, deflate=True)).decode()
        r = chiama("dividi", scan_id=m["scan_id"], student_id=c["student_id"], pdf_base64=b64)
        ok += 1
        print(f"Copia caricata: {c['student_id'][:8]} pagine {pagine}" + (" (sostituita)" if r.get("gia_presente") else ""))
    nota = d.get("nota") or ""
    if d.get("non_assegnate"):
        nota = (nota + " " if nota else "") + "Pagine senza studente: " + ", ".join(map(str, d["non_assegnate"])) + "."
    chiama("scansione_fatta", scan_id=m["scan_id"], stato="fatta", nota=nota or None, studenti=ok)
    print(f"Scansione chiusa: {ok} copie.")


def cmd_scansione_errore(a):
    chiama("scansione_fatta", scan_id=a.scan_id, stato="errore", nota=a.motivo)
    print(f"Scansione segnata con errore: {a.motivo}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scarica")
    s.add_argument("--classe")
    s.add_argument("--compito")
    s.add_argument("--id")
    s.add_argument("--dir", default="correzioni")
    s.add_argument("--tutte", action="store_true")
    s.add_argument("--nuove", action="store_true")
    s = sub.add_parser("pagine")
    s.add_argument("pdf")
    s.add_argument("--out")
    s.add_argument("--dpi", type=int, default=80)
    s = sub.add_parser("annota")
    s.add_argument("pdf")
    s.add_argument("json")
    s.add_argument("-o")
    s = sub.add_parser("carica")
    s.add_argument("json")
    s.add_argument("--pdf")
    s.add_argument("--automatica", action="store_true")
    s = sub.add_parser("salta")
    s.add_argument("submission_id")
    s.add_argument("motivo")
    s = sub.add_parser("scansioni")
    s.add_argument("--dir", default="scansioni")
    s = sub.add_parser("dividi")
    s.add_argument("manifest")
    s.add_argument("json")
    s = sub.add_parser("scansione-errore")
    s.add_argument("scan_id")
    s.add_argument("motivo")
    a = ap.parse_args()
    {"scarica": cmd_scarica, "pagine": cmd_pagine, "annota": cmd_annota, "carica": cmd_carica, "salta": cmd_salta,
     "scansioni": cmd_scansioni, "dividi": cmd_dividi, "scansione-errore": cmd_scansione_errore}[a.cmd](a)


if __name__ == "__main__":
    main()
