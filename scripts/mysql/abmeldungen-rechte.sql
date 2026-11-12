-- Modul „abm“ (Abmeldungen aus dem Polizei-Discord-Bot), 12.11.2026.
-- Stufe 1 = ansehen, Stufe 2 = annehmen/ablehnen. Bestehende Rechte werden nie überschrieben.
INSERT IGNORE INTO role_perms(rolle,modul,stufe) VALUES
 ('Administrator','abm',2),('Leitungsdienst','abm',2),('Polizeirat','abm',2),
 ('Ausbilder','abm',0),('Mitarbeiter','abm',0);
