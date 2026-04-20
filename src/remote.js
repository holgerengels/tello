const Tello = require('./tello');
const settings = require('../config/settings.json');
const readline = require('readline');

async function run() {
    const drone = new Tello();

    try {
        console.log('--- Tello Remote Control (Continuous Mode) ---');
        console.log('Stelle sicher, dass du mit dem WLAN der Drohne verbunden bist.');
        await drone.init();
        console.log('\n[Drohne ist initialisiert (SDK Modus)]');
        
        const keys = settings.keys || {};
        console.log('\n--- Tastenbelegung ---');
        Object.keys(keys).forEach(k => {
            console.log(`- [${k}]: ${keys[k]}`);
        });
        console.log('- [ctrl+c]: Beenden\n');
        
        console.log('DRÜCKE "SPACE" UM ANZUSCHWEBEN / ANZUHALTEN (STOP)!\n');

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        let rcState = { a: 0, b: 0, c: 0, d: 0 };
        const speed = 50; // Feste Geschwindigkeit anstelle von Inkrementen

        // rc command lookup (action -> axis and direction)
        const rcActionMap = {
            'forward': { axis: 'b', dir: 1 },
            'back': { axis: 'b', dir: -1 },
            'left': { axis: 'a', dir: -1 }, // seitwärts links
            'right': { axis: 'a', dir: 1 }, // seitwärts rechts
            'up': { axis: 'c', dir: 1 },
            'down': { axis: 'c', dir: -1 },
            'ccw': { axis: 'd', dir: -1 }, // drehen links herum
            'cw': { axis: 'd', dir: 1 }    // drehen rechts herum
        };

        let rcInterval = null;
        let keyTimeout = null;
        let lastAction = null;

        const sendRcCommand = () => {
            // rc a b c d
            // a: links/rechts, b: vor/zurück, c: hoch/runter, d: yaw (drehung)
            drone.send(`rc ${rcState.a} ${rcState.b} ${rcState.c} ${rcState.d}`).catch(() => {});
        };

        const stopRc = () => {
            rcState = { a: 0, b: 0, c: 0, d: 0 };
            sendRcCommand();
            if (rcInterval) {
                clearInterval(rcInterval);
                rcInterval = null;
            }
            lastAction = null;
        };

        process.stdin.on('keypress', async (str, key) => {
            if (key.ctrl && key.name === 'c') {
                console.log('\nBeende...');
                if (rcInterval) clearInterval(rcInterval);
                drone.close();
                process.exit();
            }

            const command = keys[key.name];
            if (!command) return;

            if (command === 'stop') {
                if (keyTimeout) clearTimeout(keyTimeout);
                stopRc();
                
                // Explizit den Hover-Befehl senden, um sofort anzuhalten
                drone.send('stop').catch(()=>{}); 
                console.log('\n[STOP] Drohne schwebt auf der Stelle.');
                
            } else if (command.startsWith('rc:')) {
                const action = command.split(':')[1];
                const rcDef = rcActionMap[action];
                
                if (rcDef) {
                    // Reset all axes to prevent diagonal drift when only rotating
                    rcState = { a: 0, b: 0, c: 0, d: 0 };
                    
                    // Setze den Wert auf die feste Geschwindigkeit
                    rcState[rcDef.axis] = rcDef.dir * speed;

                    if (action !== lastAction) {
                        console.log(`[RC Update] ${action} (Achse '${rcDef.axis}' = ${rcState[rcDef.axis]})`);
                        lastAction = action;
                    }
                    
                    // Timeout zurücksetzen
                    if (keyTimeout) clearTimeout(keyTimeout);
                    
                    // Nach 600ms ohne neuen Tastendruck die Drohne anhalten
                    // (Überbrückt die Auto-Repeat-Pause des Betriebssystems)
                    keyTimeout = setTimeout(() => {
                        stopRc();
                        console.log(`[Auto-Stop] Taste losgelassen. Drohne schwebt.`);
                    }, 600);
                    
                    // Befehl sofort senden für verzögerungsfreie Reaktion
                    sendRcCommand();
                    
                    // Sende Tello den neuen Status kontinuierlich, da der SDK Modus oft laufende Updates für RC erwartet
                    if (!rcInterval) {
                        rcInterval = setInterval(sendRcCommand, 50); // alle 50ms senden für direktere Steuerung
                    }
                }
            } else {
                // Normale einmalige Befehle wie takeoff, land
                console.log(`\n[Befehl ausgelöst]: ${command}`);
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
