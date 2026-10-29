/* Novaula · Novità: le note di versione pubbliche, per studenti e docente, in italiano semplice.
   Scritte dall'ufficio Press a partire da CHANGELOG.md (che resta il registro tecnico, in inglese).
   Le versioni più nuove di VERSION non si vedono, così una nota può arrivare su main prima del rilascio.
   app.js chiama:
     window.NovaulaNovita.page(contenitore, { h: h, version: VERSION })   pagina #/novita, senza accesso */
(function () {
  "use strict";

  // Dalla più nuova. nome e motto solo per le versioni che hanno un nome.
  var NOVITA = [
    { v: "2.19.1", data: "29 ottobre 2026", punti: [
        "Il prof rivede il percorso da un'aula all'altra proprio quando suona la campanella."
      ] },
    { v: "2.19.0", data: "29 ottobre 2026", nome: "Definitely not EoS",
      motto: "EoS = End of Service, quando un gioco spegne i server per sempre. Qui no: si fanno le patch che chiedete voi, e Novaula resta accesa, con agenda, classe e Classroom tutte unite.",
      punti: [
        "Nella scheda «Programma» di ogni classe c'è il nuovo riquadro «La tua settimana»: la prossima lezione con l'aula, le verifiche delle prossime 3 settimane e i compiti in scadenza entro una settimana.",
        "Per ogni verifica, un piano di ripasso: ogni sera un argomento recente con le sue slide, e alla fine la verifica di prova.",
        "Il conto alla rovescia per le prossime vacanze, dal calendario scolastico del Lazio 2026/27.",
        "Il pulsante «Classroom ↗» apre il Google Classroom della tua classe (appena il prof salva il link), senza accedere a Google da Novaula.",
        "Questa pagina, «Novità»: tutto quello che è cambiato in Novaula, versione per versione.",
        "La nuova «Informativa privacy» spiega quali tuoi dati usa Novaula, perché, per quanto tempo e quali diritti avete tu e la tua famiglia. La trovi in fondo alla home e nella pagina del tuo profilo."
      ] },
    { v: "2.18.2", data: "28 ottobre 2026", punti: [
        "Il «Quiz ciclo di progetto» ora usa i caratteri di Novaula invece di caricarli da Google: aprendolo, nessun tuo dato va a Google.",
        "Dietro le quinte: controlli automatici sulle licenze di caratteri e librerie usati dal sito."
      ] },
    { v: "2.18.1", data: "27 ottobre 2026", punti: [
        "Sistemato un errore nel nuovo strumento del prof per pianificare le verifiche."
      ] },
    { v: "2.18.0", data: "27 ottobre 2026", punti: [
        "Le verifiche confermate dal prof compaiono nella scheda «Verifiche» della tua classe.",
        "Le verifiche stampate hanno in fondo una fascia con nome, classe e data: le scansioni arrivano al compito giusto."
      ] },
    { v: "2.17.0", data: "27 ottobre 2026", punti: [
        "Se hai attivato le notifiche, il prof può mandare un messaggio veloce sul telefono a tutta la classe o a tutte le classi."
      ] },
    { v: "2.16.1", data: "26 ottobre 2026", punti: [
        "Nuovo orario e nuovi orari della campanella: 8.00, 8.55, 9.50, 10.50, 11.50, 12.45, 13.35."
      ] },
    { v: "2.16.0", data: "26 ottobre 2026", punti: [
        "5F GPOI: tutto il programma del libro, 73 presentazioni interattive con il loro PDF.",
        "Nuovi esercizi a trascinamento in tutte le presentazioni: «Dividi in categorie» e «Trascina le parole». Funzionano con mouse, dito e penna della LIM."
      ] },
    { v: "2.15.1", data: "25 ottobre 2026", punti: [
        "Dietro le quinte: il sito consuma meno risorse. L'Aiuto si aggiorna comunque in tempo reale."
      ] },
    { v: "2.15.0", data: "23 ottobre 2026", punti: [
        "Dietro le quinte: un nuovo riquadro per il prof."
      ] },
    { v: "2.14.0", data: "23 ottobre 2026", punti: [
        "Il prof ha un'agenda delle riunioni (consigli di classe e GLO) con una sveglia prima di ognuna."
      ] },
    { v: "2.13.0", data: "23 ottobre 2026", punti: [
        "Avvisi di classe: un cartellino giallo in cima alla pagina della classe, visibile in ogni scheda, che sparisce da solo a fine giornata.",
        "Se hai attivato le notifiche, ogni nuovo avviso arriva anche sul telefono. In home, le classi con un avviso hanno l'etichetta «📌 Avviso»."
      ] },
    { v: "2.12.0", data: "22 ottobre 2026", punti: [
        "Il prof ha l'orario completo della settimana, giorno per giorno, con aule e spostamenti."
      ] },
    { v: "2.11.0", data: "22 ottobre 2026", punti: [
        "Segnalibro nelle presentazioni: premi «🔖» (o il tasto B) e la prossima volta riparti da quella slide. Utile anche per ripassare da casa.",
        "Nell'orario del prof l'aula è scritta in grande, con edificio e piano."
      ] },
    { v: "2.10.0", data: "21 ottobre 2026", punti: [
        "Sulle slide di laboratorio («Al computer») c'è il pulsante giallo «📎 Consegna»: carichi foto, PDF o codice direttamente dalla lezione, anche da telefono.",
        "Ritrovi tutto in «Le mie consegne» nel tuo profilo."
      ] },
    { v: "2.9.0", data: "21 ottobre 2026", punti: [
        "Notifica sul telefono all'inizio di ogni lezione (poi spenta in 2.15.1)."
      ] },
    { v: "2.8.0", data: "20 ottobre 2026", punti: [
        "Dietro le quinte: le novità di Novaula vengono annunciate in automatico allo studio che segue il progetto."
      ] },
    { v: "2.7.0", data: "20 ottobre 2026", punti: [
        "Le correzioni dei compiti consegnati possono partire in automatico. Il voto resta nascosto finché il prof non lo conferma."
      ] },
    { v: "2.6.0", data: "20 ottobre 2026", punti: [
        "Notifiche sul telefono: le attivi in «Il mio profilo» («🔔 Notifiche sul telefono»). Ti avvisano di un nuovo voto confermato, di un «Da rifare» o di nuovo materiale.",
        "Su iPhone funzionano dopo «Aggiungi alla schermata Home»: il profilo ti spiega come."
      ] },
    { v: "2.5.0", data: "20 ottobre 2026", punti: [
        "Strumenti per la LIM: sorteggio, timer a tutto schermo e mappa dei posti."
      ] },
    { v: "2.4.0", data: "20 ottobre 2026", punti: [
        "Il prof ha la pagella con le medie per tipo di voto. Contano solo i voti confermati."
      ] },
    { v: "2.3.0", data: "20 ottobre 2026", punti: [
        "Il prof ha un riepilogo della settimana: domande senza risposta, consegne mancanti, compiti in arrivo."
      ] },
    { v: "2.2.0", data: "19 ottobre 2026", punti: [
        "3E TPSI: tutto il programma del libro, 60 presentazioni interattive con laboratori online gratuiti e senza account, compiti e verifiche di prova."
      ] },
    { v: "2.1.0", data: "19 ottobre 2026", punti: [
        "5G TPSI: tutto il programma del libro, 42 presentazioni interattive con laboratori, compiti e verifiche di prova."
      ] },
    { v: "2.0.0", data: "19 ottobre 2026", punti: [
        "«Il mio profilo»: crei il tuo profilo nella classe, con un PIN facoltativo di 4 cifre che protegge la parte privata.",
        "Nel profilo trovi i tuoi voti con le medie, tutte le consegne e il materiale personale. Nei lavori di gruppo puoi aggiungere i compagni."
      ] },
    { v: "1.7.0", data: "19 ottobre 2026", punti: [
        "Claude aiuta il prof a correggere i PDF consegnati (verde = giusto, rosso = sbagliato). Il voto lo decide sempre il prof."
      ] },
    { v: "1.6.0", data: "19 ottobre 2026", punti: ["Il prof vede la lezione in corso e la prossima."] },
    { v: "1.5.0", data: "19 ottobre 2026", punti: [
        "Nuova scheda «Aiuto»: fai una domanda veloce in classe, anche con una foto o uno screenshot. I compagni possono commentare."
      ] },
    { v: "1.4.0", data: "19 ottobre 2026", punti: [
        "1D e 1E: 53 presentazioni interattive, compiti e la nuova scheda «Verifiche».",
        "Domande sulle slide e voto dal telefono durante la lezione."
      ] },
    { v: "1.3.0", data: "16 ottobre 2026", punti: ["Il «Programma» segue le unità del libro."] },
    { v: "1.2.0", data: "13 ottobre 2026", punti: ["I PDF si aprono dentro il sito, con un pulsante «Chiudi». Su Android ora funziona."] },
    { v: "1.1.0", data: "12 ottobre 2026", punti: ["Nuova scheda «Programma»: gli argomenti in ordine, con i materiali di ogni lezione e il pulsante «Scarica»."] },
    { v: "1.0.0", data: "12 ottobre 2026", nome: "Si parte",
      motto: "Il primo giorno di Novaula.",
      punti: ["Materiali della classe, consegna dei compiti senza account, chat di classe. Si installa sul telefono come un'app."] }
  ];

  function num(v) { return v.split(".").map(Number); }
  function newer(a, b) {
    var x = num(a), y = num(b);
    for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  }

  function entry(h, n, current) {
    return h("article", { class: "card nv-entry" + (current ? " nv-current" : ""), id: "v" + n.v },
      h("div", { class: "card-top" },
        h("h2", { class: "nv-v" }, "Novaula " + n.v, n.nome ? h("span", { class: "nv-name", text: "«" + n.nome + "»" }) : null),
        current ? h("span", { class: "nv-badge", text: "Attuale" }) : null
      ),
      h("p", { class: "nv-date muted", text: n.data }),
      n.motto ? h("p", { class: "nv-motto", text: n.motto }) : null,
      h("ul", { class: "nv-list" }, n.punti.map(function (p) { return h("li", { text: p }); }))
    );
  }

  function page(app, ctx) {
    var h = ctx.h;
    var list = NOVITA.filter(function (n) { return !newer(n.v, ctx.version); });
    app.appendChild(h("section", { class: "hello" },
      h("p", { class: "eyebrow", text: "Note di versione" }),
      h("h1", null, h("span", { class: "mark", text: "Novità" }), " in Novaula"),
      h("p", { class: "lede", text: "Cosa è cambiato, versione per versione. In alto la più recente." })
    ));
    var box = h("div", { class: "list nv" });
    list.forEach(function (n, i) { box.appendChild(entry(h, n, i === 0)); });
    app.appendChild(box);
    app.appendChild(h("p", { class: "tip" }, h("a", { href: "#/", text: "← Torna alle classi" })));
  }

  window.NovaulaNovita = { page: page };
})();
