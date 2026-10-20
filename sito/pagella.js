/* Novaula · Pagella: medie di ogni studente per tipo di voto e per periodo, con i pesi scelti dal docente,
   ed esportazione in Excel (.xlsx) per compilare il registro (vedi aggiornamenti/2026-10-20-pagella.sql).
   Contano solo i voti confermati: le proposte di Claude non ancora accettate e i «Da rifare» restano fuori.
   La media è ponderata voto per voto: somma(peso del tipo × voto) / somma(pesi). Peso 0 = tipo escluso.
   app.js chiama:
     NovaulaPagella.page(contenitore, aiuti)   #/docente/pagella (solo docente) */
(function () {
  "use strict";

  var CATS = [["compito", "Compito a casa"], ["classe", "Lavoro in classe"], ["verifica", "Verifica"], ["orale", "Interrogazione"], ["progetto", "Progetto"], ["altro", "Altro"]];
  var DEF_WEIGHTS = { compito: 1, classe: 1, verifica: 2, orale: 2, progetto: 1.5, altro: 1 };
  // Periodi come mese-giorno, letti sull'anno scolastico scelto (settembre → giugno)
  var DEF_TERMS = [{ name: "Trimestre", from: "09-01", to: "12-31" }, { name: "Pentamestre", from: "01-01", to: "06-30" }];

  function ok(res) { if (res.error) throw res.error; return res.data; }
  function fullName(s) { return (s.last_name || "") + " " + (s.first_name || ""); }
  function fmt(v, d) { return v == null ? "–" : (Math.round(v * 100) / 100).toLocaleString("it-IT", { maximumFractionDigits: d == null ? 2 : d }); }
  function tone(v) { return v == null ? "" : v >= 6 ? "good" : v >= 5 ? "mid" : "bad"; }
  function schoolYearOf(iso) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? y : y - 1; }
  function todayIso() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  // "09-01" nell'anno scolastico 2026/27 -> 2026-09-01; "01-01" -> 2027-01-01
  function md(year, s) { return (+s.slice(0, 2) >= 9 ? year : year + 1) + "-" + s; }
  function periods(terms, year) {
    var list = terms.map(function (t) { return { name: t.name, from: md(year, t.from), to: md(year, t.to) }; });
    list.push({ name: "Anno intero", from: year + "-09-01", to: (year + 1) + "-08-31", whole: true });
    return list;
  }
  function validMd(s) { return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s || ""); }

  // Medie di uno studente in un periodo
  function compute(marks, w) {
    var out = { cats: {}, weighted: null, n: 0, redo: 0 }, sw = 0, sv = 0;
    CATS.forEach(function (k) { out.cats[k[0]] = { n: 0, sum: 0, avg: null }; });
    marks.forEach(function (m) {
      if (m.status === "da_rifare") { out.redo++; return; }
      if (m.status !== "confermato" || m.value == null) return;
      var c = out.cats[m.category] || out.cats.altro, v = +m.value, wt = w[m.category] != null ? +w[m.category] : 1;
      c.n++; c.sum += v; out.n++;
      if (wt > 0) { sw += wt; sv += wt * v; }
    });
    CATS.forEach(function (k) { var c = out.cats[k[0]]; c.avg = c.n ? c.sum / c.n : null; });
    out.weighted = sw ? sv / sw : null;
    out.proposal = out.weighted == null ? null : Math.max(1, Math.min(10, Math.round(out.weighted)));
    return out;
  }

  /* ---------- Pagina ---------- */
  async function page(root, x) {
    var h = x.h;
    root.appendChild(h("a", { class: "back", href: "#/docente", text: "← Area docente" }));
    root.appendChild(h("h1", { text: "Pagella" }));
    if (!x.sb) { root.appendChild(x.notice("err", "La pagella funziona solo con il database collegato.")); return; }
    var classes = x.classes || [];
    if (!classes.length) { root.appendChild(h("p", { class: "empty", text: "Nessuna classe." })); return; }
    var pref = {};
    try { pref = JSON.parse(localStorage.getItem("novaula-pagella") || "{}"); } catch (e) {}
    var state = { cid: classes.some(function (c) { return c.id === pref.cid; }) ? pref.cid : classes[0].id, year: schoolYearOf(todayIso()), period: pref.period || 0 };
    function savePref() { try { localStorage.setItem("novaula-pagella", JSON.stringify({ cid: state.cid, period: state.period })); } catch (e) {} }

    var settings = {};
    try { (ok(await x.sb.from("grade_settings").select("*")) || []).forEach(function (r) { settings[r.scope] = r; }); } catch (e) { root.appendChild(x.notice("err", x.errText(e))); }
    function weightsFor(cid) {
      var cw = settings[cid] && settings[cid].weights, gw = settings.tutte && settings.tutte.weights;
      return Object.assign({}, DEF_WEIGHTS, gw || {}, cw || {});
    }
    function classOwn(cid) { return !!(settings[cid] && settings[cid].weights && Object.keys(settings[cid].weights).length); }
    function terms() { var t = settings.tutte && settings.tutte.terms; return t && t.length ? t : DEF_TERMS; }

    var clSel = h("select", { "aria-label": "Classe" }, classes.map(function (c) { return h("option", { value: c.id, text: c.name, selected: c.id === state.cid ? true : null }); }));
    var yrSel = h("select", { "aria-label": "Anno scolastico" });
    var pdSel = h("select", { "aria-label": "Periodo" });
    var setBox = h("div");
    var tableBox = h("div", { class: "pg-wrap" });
    var info = h("p", { class: "small muted" });
    var xlsBtn = h("button", { class: "btn primary", type: "button", text: "Scarica Excel" });
    root.appendChild(h("div", { class: "card stack" },
      h("div", { class: "pg-controls" },
        h("label", null, "Classe", clSel), h("label", null, "Anno scolastico", yrSel), h("label", null, "Periodo", pdSel)),
      info,
      h("div", { class: "row" }, xlsBtn)));
    root.appendChild(setBox);
    root.appendChild(tableBox);

    var data = null; // { students, marks }
    function fillPeriods() {
      var ps = periods(terms(), state.year);
      if (state.period >= ps.length) state.period = 0;
      pdSel.replaceChildren.apply(pdSel, ps.map(function (p, i) { return h("option", { value: i, text: p.name, selected: i === state.period ? true : null }); }));
    }
    function fillYears() {
      var now = schoolYearOf(todayIso()), min = now;
      (data ? data.marks : []).forEach(function (m) { min = Math.min(min, schoolYearOf(m.mark_date)); });
      var ys = []; for (var y = now; y >= min; y--) ys.push(y);
      yrSel.replaceChildren.apply(yrSel, ys.map(function (y) { return h("option", { value: y, text: y + "/" + String(y + 1).slice(2), selected: y === state.year ? true : null }); }));
    }

    async function load() {
      tableBox.replaceChildren(h("p", { class: "empty", text: "Caricamento…" }));
      try {
        var r = await Promise.all([
          x.sb.from("students").select("id, first_name, last_name").eq("class_id", state.cid).order("last_name").order("first_name"),
          x.sb.from("marks").select("id, student_id, category, title, label, value, status, source, mark_date").eq("class_id", state.cid).order("mark_date")
        ]);
        data = { students: ok(r[0]), marks: ok(r[1]) };
      } catch (e) { data = null; tableBox.replaceChildren(x.notice("err", x.errText(e))); return; }
      fillYears(); fillPeriods(); renderSettings(); render();
    }

    function rowsFor(p) {
      var w = weightsFor(state.cid), by = {};
      data.marks.forEach(function (m) { if (m.mark_date >= p.from && m.mark_date <= p.to) (by[m.student_id] = by[m.student_id] || []).push(m); });
      return data.students.map(function (s) { var ms = by[s.id] || []; return { s: s, marks: ms, r: compute(ms, w), pending: ms.filter(function (m) { return m.status === "proposto"; }).length }; });
    }

    function render() {
      if (!data) return;
      var p = periods(terms(), state.year)[state.period], w = weightsFor(state.cid);
      var rows = rowsFor(p), pending = rows.reduce(function (a, r) { return a + r.pending; }, 0);
      var used = CATS.filter(function (k) { return rows.some(function (r) { return r.r.cats[k[0]].n; }); });
      if (!used.length) used = CATS.filter(function (k) { return k[0] === "compito" || k[0] === "verifica" || k[0] === "orale"; });
      info.replaceChildren(
        x.fmtDate(p.from) + " – " + x.fmtDate(p.to) + ". Contano solo i voti confermati: le proposte di Claude non accettate e i «Da rifare» non entrano nella media.",
        pending ? h("b", { text: " " + pending + (pending === 1 ? " voto da confermare" : " voti da confermare") + " in questo periodo." }) : null);
      if (!data.students.length) { tableBox.replaceChildren(h("p", { class: "empty", text: "Nessuno studente ha ancora creato il profilo in questa classe." })); return; }
      var head = h("tr", null, h("th", { class: "pg-name", text: "Studente" }),
        used.map(function (k) { return h("th", null, k[1], h("span", { class: "pg-w", text: "peso " + fmt(w[k[0]]) })); }),
        h("th", { text: "Voti" }), h("th", { text: "Media ponderata" }), h("th", { text: "Proposta" }));
      var body = h("tbody", null, rows.map(function (row) {
        var r = row.r;
        return h("tr", null,
          h("th", { class: "pg-name", scope: "row" },
            h("a", { href: "#/c/" + state.cid + "/profilo?s=" + row.s.id, text: fullName(row.s) }),
            row.pending ? h("span", { class: "badge redo-badge", text: row.pending + " da confermare" }) : null,
            r.redo ? h("span", { class: "badge", text: r.redo + " da rifare" }) : null),
          used.map(function (k) {
            var c = r.cats[k[0]];
            return h("td", null, c.n ? h("span", { class: "pg-v " + tone(c.avg), text: fmt(c.avg) }) : h("span", { class: "muted", text: "–" }), c.n ? h("span", { class: "pg-n", text: "(" + c.n + ")" }) : null);
          }),
          h("td", { text: String(r.n) }),
          h("td", null, h("span", { class: "mk " + tone(r.weighted), text: fmt(r.weighted) })),
          h("td", null, h("span", { class: "mk big " + tone(r.proposal), text: r.proposal == null ? "–" : String(r.proposal) })));
      }));
      tableBox.replaceChildren(h("table", { class: "pg-table" }, h("thead", null, head), body));
    }

    /* Pesi e periodi */
    function renderSettings() {
      var w = weightsFor(state.cid), t = terms(), cl = x.findClass(state.cid);
      var msg = h("div");
      var winputs = CATS.map(function (k) {
        return h("label", null, k[1], h("input", { type: "number", min: 0, max: 10, step: 0.5, name: "w_" + k[0], value: w[k[0]], inputmode: "decimal" }));
      });
      var own = h("input", { type: "checkbox", name: "own", checked: classOwn(state.cid) ? true : null });
      var tinputs = t.map(function (p, i) {
        return h("div", { class: "pg-term" },
          h("label", null, "Nome", h("input", { type: "text", name: "tn" + i, value: p.name, maxlength: 30, required: true })),
          h("label", null, "Dal (gg/mm)", h("input", { type: "text", name: "tf" + i, value: p.from.slice(3) + "/" + p.from.slice(0, 2), pattern: "\\d{2}/\\d{2}", required: true })),
          h("label", null, "Al (gg/mm)", h("input", { type: "text", name: "tt" + i, value: p.to.slice(3) + "/" + p.to.slice(0, 2), pattern: "\\d{2}/\\d{2}", required: true })));
      });
      var form = h("form", { class: "stack" },
        h("p", { class: "small muted", text: "Ogni voto pesa quanto il suo tipo: una verifica con peso 2 conta come due compiti con peso 1. Peso 0 esclude il tipo dalla media. La proposta è la media ponderata arrotondata al voto intero." }),
        h("div", { class: "pg-weights" }, winputs),
        h("label", { class: "check-row" }, own, "Pesi solo per " + (cl ? cl.name : "questa classe") + " (altrimenti valgono per tutte le classi)"),
        h("h3", { text: "Periodi (per tutte le classi)" }),
        h("div", { class: "stack" }, tinputs),
        h("div", { class: "row" },
          h("button", { class: "btn primary", type: "submit", text: "Salva" }),
          h("button", { class: "btn link", type: "button", text: "Ripristina valori predefiniti", onclick: function () {
            CATS.forEach(function (k) { form.elements["w_" + k[0]].value = DEF_WEIGHTS[k[0]]; });
            DEF_TERMS.forEach(function (p, i) { if (form.elements["tn" + i]) { form.elements["tn" + i].value = p.name; form.elements["tf" + i].value = p.from.slice(3) + "/" + p.from.slice(0, 2); form.elements["tt" + i].value = p.to.slice(3) + "/" + p.to.slice(0, 2); } });
          } })),
        msg);
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var nw = {};
        for (var i = 0; i < CATS.length; i++) {
          var v = parseFloat(String(form.elements["w_" + CATS[i][0]].value).replace(",", "."));
          if (!(v >= 0 && v <= 10)) { msg.replaceChildren(x.notice("err", "Ogni peso va da 0 a 10.")); return; }
          nw[CATS[i][0]] = v;
        }
        var nt = [];
        for (var j = 0; j < t.length; j++) {
          var f = String(form.elements["tf" + j].value).split("/"), to = String(form.elements["tt" + j].value).split("/");
          var p = { name: form.elements["tn" + j].value.trim().slice(0, 30), from: (f[1] || "") + "-" + (f[0] || ""), to: (to[1] || "") + "-" + (to[0] || "") };
          if (!p.name || !validMd(p.from) || !validMd(p.to)) { msg.replaceChildren(x.notice("err", "Controlla i periodi: le date vanno scritte come gg/mm, per esempio 01/09.")); return; }
          nt.push(p);
        }
        var btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
        try {
          var now = new Date().toISOString(), up = [];
          var g = { scope: "tutte", weights: own.checked ? (settings.tutte && settings.tutte.weights) || {} : nw, terms: nt, updated_at: now };
          up.push(g);
          if (own.checked || settings[state.cid]) up.push({ scope: state.cid, weights: own.checked ? nw : {}, terms: [], updated_at: now });
          ok(await x.sb.from("grade_settings").upsert(up));
          up.forEach(function (r) { settings[r.scope] = r; });
          x.toast("Pesi e periodi salvati.");
          fillPeriods(); renderSettings(); render();
        } catch (err) { msg.replaceChildren(x.notice("err", x.errText(err))); btn.disabled = false; }
      });
      setBox.replaceChildren(h("details", { class: "teacher" }, h("summary", { text: "Pesi dei voti e periodi" }), form));
    }

    /* Excel: un foglio per periodo con le medie, più l'elenco dei voti confermati */
    xlsBtn.addEventListener("click", function () {
      if (!data) return;
      var cl = x.findClass(state.cid), w = weightsFor(state.cid), ps = periods(terms(), state.year), sheets = [];
      var yr = state.year + "/" + String(state.year + 1).slice(2);
      ps.forEach(function (p) {
        var rows = rowsFor(p);
        var aoa = [[(cl ? cl.name : state.cid) + " · " + p.name + " " + yr + " (" + x.fmtDate(p.from) + " – " + x.fmtDate(p.to) + ")"], []];
        aoa.push(["Cognome", "Nome"].concat(CATS.map(function (k) { return k[1] + " (peso " + fmt(w[k[0]]) + ")"; }), ["N. voti", "Media ponderata", "Proposta", "Da confermare", "Da rifare"]));
        rows.forEach(function (row) {
          var r = row.r;
          aoa.push([row.s.last_name, row.s.first_name].concat(CATS.map(function (k) { var a = r.cats[k[0]].avg; return a == null ? "" : Math.round(a * 100) / 100; }),
            [r.n, r.weighted == null ? "" : Math.round(r.weighted * 100) / 100, r.proposal == null ? "" : r.proposal, row.pending || "", r.redo || ""]));
        });
        aoa.push([]);
        aoa.push(["Contano solo i voti confermati dal docente. Media ponderata voto per voto con i pesi indicati; proposta = media arrotondata."]);
        sheets.push({ name: p.name, rows: aoa, header: 2, widths: [18, 16].concat(CATS.map(function () { return 14; }), [9, 12, 10, 12, 10]) });
      });
      var from = ps[ps.length - 1].from, to = ps[ps.length - 1].to, byId = {};
      data.students.forEach(function (s) { byId[s.id] = s; });
      var list = [["Cognome", "Nome", "Data", "Tipo", "Titolo", "Voto", "Valore", "Peso"]];
      var CAT = {}; CATS.forEach(function (k) { CAT[k[0]] = k[1]; });
      data.marks.filter(function (m) { return m.status === "confermato" && m.value != null && m.mark_date >= from && m.mark_date <= to && byId[m.student_id]; })
        .sort(function (a, b) { var A = byId[a.student_id], B = byId[b.student_id]; return fullName(A).localeCompare(fullName(B), "it") || (a.mark_date < b.mark_date ? -1 : 1); })
        .forEach(function (m) { var s = byId[m.student_id]; list.push([s.last_name, s.first_name, m.mark_date.split("-").reverse().join("/"), CAT[m.category] || m.category, m.title, m.label || String(m.value), +m.value, w[m.category] != null ? +w[m.category] : 1]); });
      sheets.push({ name: "Voti", rows: list, header: 0, widths: [18, 16, 11, 16, 40, 7, 8, 6] });
      var blob = xlsx(sheets);
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pagella-" + (cl ? cl.name : state.cid).replace(/[^\w-]+/g, "-").toLowerCase() + "-" + state.year + "-" + String(state.year + 1).slice(2) + ".xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });

    clSel.addEventListener("change", function () { state.cid = clSel.value; savePref(); load(); });
    yrSel.addEventListener("change", function () { state.year = +yrSel.value; fillPeriods(); render(); });
    pdSel.addEventListener("change", function () { state.period = +pdSel.value; savePref(); render(); });
    fillYears(); fillPeriods();
    load();
  }

  /* ---------- Piccolo scrittore .xlsx (zip senza compressione) ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""); }
  function col(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function sheetXml(sh) {
    var rows = sh.rows.map(function (r, ri) {
      var cells = r.map(function (v, ci) {
        var ref = col(ci) + (ri + 1), st = ri === sh.header ? ' s="1"' : ri === 0 && sh.header > 0 ? ' s="3"' : "";
        if (v === "" || v == null) return "";
        if (typeof v === "number") return '<c r="' + ref + '"' + (st || ' s="2"') + "><v>" + v + "</v></c>";
        return '<c r="' + ref + '" t="inlineStr"' + st + "><is><t xml:space=\"preserve\">" + esc(v) + "</t></is></c>";
      }).join("");
      return '<row r="' + (ri + 1) + '">' + cells + "</row>";
    }).join("");
    var cols = sh.widths ? "<cols>" + sh.widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + "</cols>" : "";
    var pane = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + (sh.header + 1) + '" topLeftCell="A' + (sh.header + 2) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + pane + cols + "<sheetData>" + rows + "</sheetData></worksheet>";
  }
  function xlsx(sheets) {
    var names = {};
    sheets.forEach(function (s, i) {
      var n = s.name.replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31) || "Foglio" + (i + 1);
      while (names[n]) n = n.slice(0, 28) + " " + i;
      names[n] = 1; s.name = n;
    });
    var files = [
      ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") + "</Types>"],
      ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + "</sheets></workbook>"],
      ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ["xl/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF1FA"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']
    ];
    sheets.forEach(function (s, i) { files.push(["xl/worksheets/sheet" + (i + 1) + ".xml", sheetXml(s)]); });
    return new Blob([zip(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  var CRC;
  function crc32(b) {
    if (!CRC) { CRC = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    var x = 0xffffffff; for (var i = 0; i < b.length; i++) x = CRC[(x ^ b[i]) & 255] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f[0]), data = enc.encode(f[1]), crc = crc32(data);
      var common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      var head = new Uint8Array([].concat(u32(0x04034b50), common));
      parts.push(head, name, data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(off))), name);
      off += head.length + name.length + data.length;
    });
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(csize), u32(off), u16(0)));
    return new Blob(parts.concat(central, [end]));
  }

  window.NovaulaPagella = { page: page, compute: compute, xlsx: xlsx };
})();
