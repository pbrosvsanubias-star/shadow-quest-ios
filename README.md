# Shadow Quest für iPhone – mit Windows bauen und installieren

Dieses Projekt enthält die iOS-Portierung von **Shadow Quest 1.10.0, Build 25** für **iOS 16 oder neuer**. GitHub Actions soll daraus auf einem Cloud-Mac eine IPA bauen; anschließend signierst und installierst du sie mit Sideloadly auf deinem Windows-PC.

**Aktueller Stand: Es gibt noch keine fertige IPA.** Die Projektstruktur, Swift-Syntax und JavaScript wurden lokal geprüft. Ein vollständiger Xcode-Build und Tests auf einem echten iPhone stehen noch aus. Der erste GitHub-Lauf kann deshalb noch Fehler zeigen, die anschließend behoben werden müssen.

## 1. Das vollständige Projekt auf GitHub hochladen

Verwende vorzugsweise ein **privates Repository**, zum Beispiel `shadow-quest-ios`. Eine einfache Möglichkeit bietet [GitHub Desktop für Windows](https://github.com/apps/desktop).

1. Entpacke das Projekt-ZIP mit **Alle extrahieren** in einen normalen Ordner. Lade nicht nur die ZIP-Datei ins Repository hoch.
2. Öffne GitHub Desktop und melde dich mit deinem GitHub-Konto an. Für ein vorhandenes Repository wähle **File → Clone repository** und klone es auf deinen PC. Für ein neues wähle **File → New repository** und erstelle `shadow-quest-ios`.
3. Kopiere den gesamten entpackten Projektinhalt in diesen Repository-Ordner. Dazu gehören ausdrücklich `.github`, `ShadowQuest`, `ShadowQuest.xcodeproj`, `tools` und diese README. Behalte auch die mitgelieferten Dateien wie `.gitignore`.
4. Kontrolliere die Struktur: Direkt im Repository müssen `ShadowQuest.xcodeproj` und `.github/workflows/build-ios.yml` liegen. Ein zusätzlicher Projekt-Unterordner dazwischen verhindert den Build. Falls du `.github` im Explorer nicht siehst, aktiviere die Anzeige ausgeblendeter Elemente.
5. Trage in GitHub Desktop eine Zusammenfassung wie `Shadow Quest iOS hinzufügen` ein und klicke **Commit to main**. Für ein neues Repository: **Publish repository**, **Keep this code private** aktiviert lassen. Für ein bereits veröffentlichtes Repository: **Push origin**.

Die Veröffentlichung über GitHub Desktop ist in der [offiziellen GitHub-Anleitung](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop) beschrieben. Für den vorgesehenen Build brauchst du keine Apple-ID und keine Apple-Zertifikate in GitHub.

## 2. Die IPA auf dem Cloud-Mac bauen

1. Öffne dein Repository auf GitHub und wähle **Actions**.
2. Wähle links **Build Shadow Quest IPA**.
3. Klicke **Run workflow**, wähle den Branch `main` und starte den Lauf. Nach einem Upload auf `main` kann bereits automatisch ein Lauf gestartet sein; dann genügt dieser.
4. Öffne den Lauf und warte auf den grünen erfolgreichen Abschluss. Bei einem roten Fehler öffne den fehlgeschlagenen Schritt und bewahre den Fehlertext für die Korrektur auf.
5. Öffne unten **Artifacts** und lade **Shadow-Quest-IPA** herunter. Entpacke dieses ZIP. Es enthält `Shadow-Quest-unsigned.ipa` und die zugehörige SHA-256-Datei.

Der Workflow verwendet `macos-15`, führt Projekt-/JavaScript-Prüfungen sowie Swift-Tests aus und startet `tools/build-ipa.sh`. Dieses Skript baut mit Xcode eine ARM64-App für echte iPhones und verpackt sie als **unsignierte IPA**. Das Artefakt wird im vorgesehenen Workflow sieben Tage aufbewahrt.

GitHub erklärt das [manuelle Starten](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow?tool=webui) und [Herunterladen von Artefakten](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts?tool=webui). Private Repositorys nutzen das Build-Kontingent deines Kontos; weitere Runner-Zeit kann kostenpflichtig sein. Siehe [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## 3. Auf Windows signieren und aufs iPhone installieren

1. Lade [Sideloadly](https://sideloadly.io/) von der offiziellen Seite und installiere die Windows-Version. Beachte dort auch die Voraussetzungen für Apples iTunes- und iCloud-Komponenten.
2. Verbinde dein entsperrtes iPhone per USB. Bestätige auf dem iPhone, dass du diesem Computer vertraust.
3. Öffne Sideloadly, wähle dein iPhone und ziehe `Shadow-Quest-unsigned.ipa` ins Programm.
4. Gib deine Apple-ID **nur in Sideloadly** ein und starte die Installation. Folge gegebenenfalls der Zwei-Faktor-Abfrage. Teile Apple-ID, Passwort und Bestätigungscodes weder hier im Chat noch im Repository.
5. Falls iOS es verlangt: Aktiviere **Einstellungen → Datenschutz & Sicherheit → Entwicklermodus** und folge den Neustart-Hinweisen. Bei „Nicht vertrauenswürdiger Entwickler“ bestätige das Profil unter **Einstellungen → Allgemein → VPN & Geräteverwaltung**.

Mit einer kostenlosen Apple-ID ist die Signierung **sieben Tage** gültig. Danach musst du die App erneut signieren. Sideloadlys automatische Auffrischung benötigt einen laufenden PC und ein erreichbares iPhone über USB oder eingerichtetes WLAN. Verwende beim erneuten Installieren dieselbe Apple-ID und dieselbe Bundle-ID und überschreibe die vorhandene App, damit lokale Daten erhalten bleiben. Die [offizielle Sideloadly-FAQ](https://sideloadly.io/faq.html) beschreibt diese Schritte.

## Was bereits umgesetzt ist – und was du zuerst testen solltest

- Die vorhandene Oberfläche wurde übernommen. GPS-Läufe, lokale Trainingsspeicherung, XP, Tagesgeschenke, Profil und Freundesliste haben eine native iOS-Implementierung.
- Die Kamera verwendet Apples **Vision**. Sie zählt konservativ vollständige Bewegungszyklen. Stelle das Handy im Hochformat stabil auf und bringe den ganzen Körper gut beleuchtet ins Bild. Die iOS-Erkennung unterscheidet sich von Android; ihre Zuverlässigkeit ist noch nicht auf einem iPhone bestätigt.
- Speichere Kamera-Sätze vor dem Beenden der App. Ungespeicherte Kamera-Zähler gehen beim Beenden verloren. Gespeicherte Trainings bleiben lokal; die Deinstallation löscht sie.
- Daten und Gastprofile aus der Android-App werden nicht automatisch migriert.
- Die Firebase-Rangliste ist vorbereitet und wird erst bei Teilnahme angesprochen. Live-Anmeldung, API-Zugriff und Firestore-Regeln wurden nicht getestet. GPS-Routen, Kamerabilder, Bio und die private Freundesliste werden dabei nicht hochgeladen; geteilt werden Hunter-Name und zusammengefasste Trainings-XP.

Teste nach der ersten Installation zunächst einen manuellen Push-Up-Satz, einen kurzen GPS-Lauf, ein Tagesgeschenk und einen Neustart. Prüfe danach Kamera und Online-Rangliste einzeln.

## Herkunft

Basis: die bereitgestellte Android-Datei `Shadow-Quest.apk`, Version **1.10.0**, Build **25**. SHA-256 der ursprünglichen APK:

```text
24AB78DBEB3E92E4221FECCEE5A3DF69AD3F90C4523A3AE1A663D458C6DD8BF9
```

Der iOS-Quellcode ersetzt die Android-Brücke durch WKWebView, CoreLocation, Vision und lokale Speicherung. Die fertige IPA entsteht erst nach einem erfolgreichen Cloud-Build und benötigt anschließend die Signierung für dein iPhone.
