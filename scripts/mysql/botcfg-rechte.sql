-- Modul „botcfg“ (Bot-Konfiguration des Polizei-Discord-Bots), 14.11.2026.
-- Stufe 1 = ansehen, Stufe 2 = speichern. Standard: nur Administrator. Bestehende Rechte werden nie überschrieben.
INSERT IGNORE INTO role_perms(rolle,modul,stufe)
 SELECT name,'botcfg',CASE WHEN name='Administrator' THEN 2 ELSE 0 END FROM roles;
