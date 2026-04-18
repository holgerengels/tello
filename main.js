const Tello = require('./tello');

async function run() {
    const drone = new Tello();

    try {
        console.log('--- Verbinde mit der Tello Drohne ---');
        console.log('Stelle sicher, dass du mit dem WLAN der Drohne verbunden bist.');
        
        // Drohne initialisieren (sendet den 'command' Befehl)
        await drone.init();
        
        // Kurzer Batteriestatus Check, bevor wir abheben
        await drone.send('battery?');

        console.log('\n--- Starte Flugsequenz ---');
        
        console.log('Heben ab...');
        await drone.send('takeoff');

        const distance = 50; // cm (Tello benötigt mindestens 20cm als Wert)
        
        console.log(`\nFliege ein Quadrat (${distance}x${distance} cm)...`);
        
        // Quadratmuster fliegen: 4x (Vorwärts und um 90 Grad drehen)
        for (let i = 1; i <= 4; i++) {
            console.log(`\nSeite ${i}:`);
            await drone.send(`forward ${distance}`);
            await drone.send('cw 90'); // cw = Clockwise (im Uhrzeigersinn)
        }

        console.log('\nAlle Seiten abgeflogen. Lande...');
        await drone.send('land');

        console.log('\n--- Flug erfolgreich beendet ---');

    } catch (error) {
        console.error('\n[FEHLER] Ein Problem ist aufgetreten:', error);
        
        // Im Fehlerfall vorsichtshalber trotzdem den Landebefehl senden
        console.log('Versuche Notlandung...');
        try {
            await drone.send('land');
        } catch (landingError) {
            console.error('Notlandung fehlgeschlagen:', landingError);
        }
    } finally {
        // Sicherstellen, dass die Verbindung immer geschlossen wird
        drone.close();
    }
}

// Skript ausführen
run();
