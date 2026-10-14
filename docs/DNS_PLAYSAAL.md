# playsaal.com – DNS-Bestandsaufnahme und Cloudflare-Zielzone

Stand: 14.10.2026, 19:00 · Quelle: öffentliche Abfrage über dns.google (die Werte, die STRATO tatsächlich ausliefert) + STRATO-Übersicht (Screenshot). **Noch nichts geändert.**

## IST (STRATO, Nameserver docks10.rzone.de / shades01.rzone.de, TTL 150 s)

| Name | Typ | Wert | Bedeutung |
|---|---|---|---|
| playsaal.com | NS | docks10.rzone.de, shades01.rzone.de | STRATO-DNS |
| playsaal.com | A | 217.160.0.186 | STRATO-Platzhalterseite |
| playsaal.com | AAAA | 2001:8d8:100f:f000::200 | STRATO-Platzhalterseite |
| www.playsaal.com | CNAME | playsaal.com | |
| playsaal.com | MX | 5 smtpin.rzone.de | STRATO-Mail-Eingang |
| _dmarc.playsaal.com | TXT | `v=DMARC1;p=reject;` | Mail im Namen der Domain wird abgelehnt |
| playsaal.com | TXT (SPF) | – keiner – | |
| playsaal.com | CAA | – keiner – | |
| autodiscover.playsaal.com | CNAME | – keiner – | |
| *.playsaal.com | Wildcard | – keiner – | |
| DS (bei .com) | DNSSEC | – keiner – | DNSSEC ist **aus** → kein Schritt bei STRATO nötig |

Nicht öffentlich ermittelbar: DKIM-Einträge (Selektor unbekannt) und SRV-Einträge. → in STRATO unter „TXT- und CNAME-Records“ und „SRV-Record“ nachsehen.

Einschätzung: Das ist der STRATO-Standard für eine frisch registrierte Domain. Kein SPF und `DMARC p=reject` heißt: Von @playsaal.com wird derzeit keine Mail versendet. Ob ein Postfach Mail **empfängt**, hängt davon ab, ob in STRATO ein Postfach angelegt ist.

## SOLL (Cloudflare-Zone playsaal.com, im Konto mit Worker `playaz`)

| Name | Typ | Wert | Proxy | Hinweis |
|---|---|---|---|---|
| playsaal.com | – | Custom Domain am Worker `playaz` | – | legt Cloudflare selbst an; **STRATO-A/AAAA nicht übernehmen** |
| www | CNAME | playsaal.com | proxied | + Weiterleitung 301 www → Apex (Redirect Rule) |
| playsaal.com | MX | 5 smtpin.rzone.de | DNS only | 1:1 von STRATO, damit ein STRATO-Postfach weiter funktioniert |
| _dmarc | TXT | `v=DMARC1;p=reject;` | DNS only | 1:1 von STRATO |
| ggf. DKIM/SPF/SRV | | laut STRATO-Ansicht | DNS only | nur falls dort vorhanden |

Beim Anlegen der Zone liest Cloudflare die STRATO-Einträge selbst ein → vor dem Speichern mit dieser Tabelle abgleichen und die importierten A/AAAA für Apex löschen.
