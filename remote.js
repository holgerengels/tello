const Tello = require('./tello');
const settings = require('./config/settings.json');
const readline = require('readline');

async function run() {
    const drone = new Tello();

    try {
        console.log('--- Tello Remote Control ---');
        console.log('Stelle sicher, dass du mit dem WLAN der Drohne verbunden bist.');
        await drone.init();
        console.log('\n[Drohne ist initialisiert (SDK Modus)]');
        
        const keys = settings.keys || {};
        console.log('\n--- Tastenbelegung ---');
        Object.keys(keys).forEach(k => {
            console.log(`- [${k}]: ${keys[k]}`);
        });
        console.log('- [ctrl+c]: Beenden\n');

        console.log('Warte auf Eingabe...');

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        process.stdin.on('keypress', async (str, key) => {
            // Beenden bei ctrl+c
            if (key.ctrl && key.name === 'c') {
                console.log('\nBeende...');
                drone.close();
                process.exit();
            }

            const command = keys[key.name];
            if (command) {
                // Wir nutzen hier Fire & Forget, da wir bei einer manuellen Steuerung 
                // nicht zwingend auf das Ende einer Bewegung warten wollen, bis wir
                // z.B. einen Stop-Befehl absetzen.
                drone.send(command).catch(e => {
                    console.error(`Fehler beim Senden von '${command}':`, e);
                });
            }
        });

    } catch (error) {
        console.error('\n[FEHLER] Laufzeitfehler:', error);
        drone.close();
    }
}

// Skript ausführen
run();
