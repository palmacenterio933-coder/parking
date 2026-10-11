-- Solo si YA habías corrido schema.sql antes de esta versión:
alter table celdas add column if not exists fila int;
alter table celdas add column if not exists col int;
