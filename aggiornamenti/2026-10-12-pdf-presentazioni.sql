-- Aggiunge il PDF scaricabile alle tre presentazioni (da eseguire una volta nel SQL Editor)
alter table materials add column if not exists pdf_url text;
update materials set pdf_url = 'contenuti/densita-e-incidenza-percentuale.pdf' where url = 'https://claude.ai/artifact/YXippEqpmMPmB94NriwqJT';
update materials set pdf_url = 'contenuti/ciclo-di-vita-del-software.pdf'      where url = 'https://claude.ai/artifact/L2z6Rt8YHFzu8u2KnAxBXb';
update materials set pdf_url = 'contenuti/ciclo-di-vita-del-progetto.pdf'      where url = 'https://claude.ai/artifact/FMS18ViZRQQEVNhYyF8eth';
