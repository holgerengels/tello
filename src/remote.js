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
        const speed = 50; // Geschwindigkeit der Bewegung (10 bis 100)

        // rc command lookup (action -> axis and velocity change)
        const rcActionMap = {
            'forward': { axis: 'b', val: speed },
            'back': { axis: 'b', val: -speed },
            'left': { axis: 'a', val: -speed }, // seitwärts links
            'right': { axis: 'a', val: speed }, // seitwärts rechts
            'up': { axis: 'c', val: speed },
            'down': { axis: 'c', val: -speed },
            'ccw': { axis: 'd', val: -speed }, // drehen links herum
            'cw': { axis: 'd', val: speed }    // drehen rechts herum
        };

        let rcInterval = null;

        const sendRcCommand = () => {
            // rc a b c d
            // a: links/rechts, b: vor/zurück, c: hoch/runter, d: yaw (drehung)
            drone.send(`rc ${rcState.a} ${rcState.b} ${rcState.c} ${rcState.d}`).catch(() => {});
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
                // Alle RC werte auf 0 zurücksetzen und anhalten
                rcState = { a: 0, b: 0, c: 0, d: 0 };
                if (rcInterval) {
                    clearInterval(rcInterval);
                    rcInterval = null;
                }
                
                // Explizit den Hover-Befehl senden, um sofort anzuhalten
                drone.send('rc 0 0 0 0').catch(()=>{}); 
                drone.send('stop').catch(()=>{}); 
                console.log('\n[STOP] Drohne schwebt auf der Stelle.');
                
            } else if (command.startsWith('rc:')) {
                const action = command.split(':')[1];
                const rcDef = rcActionMap[action];
                
                if (rcDef) {
                    // Werte updaten
                    rcState[rcDef.axis] = rcDef.val;
                    console.log(`[RC Update] Axis '${rcDef.axis}' = ${rcDef.val} (a:${rcState.a} b:${rcState.b} c:${rcState.c} d:${rcState.d})`);
                    
                    // Sende Tello den neuen Status kontinuierlich, da der SDK Modus oft laufende Updates für RC erwartet
                    if (!rcInterval) {
                        sendRcCommand();
                        rcInterval = setInterval(sendRcCommand, 200); // alle 200ms senden
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
