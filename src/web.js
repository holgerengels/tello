const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const Tello = require('./tello');

async function run() {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);

    // Statische Dateien (HTML/CSS) ausliefern
    app.use(express.static(path.join(__dirname, '../public')));

    // Settings bereitstellen
    app.get('/api/settings', (req, res) => {
        res.sendFile(path.join(__dirname, '../config/settings.json'));
    });

    // Drohne initialisieren
    const drone = new Tello();
    try {
        console.log('--- Tello Web Server ---');
        console.log('Initialisiere Drohne...');
        await drone.init();
        console.log('[Drohne ist initialisiert und bereit]');
    } catch (e) {
        console.error('\n[FEHLER] Fehler bei der Drohnen-Initialisierung:', e);
    }

    let rcInterval = null;
    let currentRC = { a: 0, b: 0, c: 0, d: 0 };

    const sendRcCommand = () => {
        drone.send(`rc ${currentRC.a} ${currentRC.b} ${currentRC.c} ${currentRC.d}`).catch(() => {});
    };

    io.on('connection', (socket) => {
        console.log('\n[Web] Ein Benutzer (Browser) hat sich verbunden.');

        // Empfange einfache Befehle (takeoff, land, stop, battery?)
        socket.on('command', (cmd) => {
            console.log(`[Web Befehl] ${cmd}`);
            if (cmd === 'stop') {
                currentRC = { a: 0, b: 0, c: 0, d: 0 };
            }
            drone.send(cmd).then(res => {
                if (cmd === 'battery?') {
                    socket.emit('battery_status', res);
                }
            }).catch(e => console.error(e));
        });

        // Empfange kontinuierliche RC Steuerungsbefehle
        socket.on('rc', (rc) => {
            // Nur loggen wenn sich was ändert (optional)
            const changed = currentRC.a !== rc.a || currentRC.b !== rc.b || currentRC.c !== rc.c || currentRC.d !== rc.d;
            if (changed) {
                console.log(`[RC Update] a:${rc.a} b:${rc.b} c:${rc.c} d:${rc.d}`);
            }

            currentRC = rc;
            sendRcCommand(); // Sofort senden für 0ms Latenz

            // Prüfe ob irgendeine Achse aktiv ist
            const isMoving = rc.a !== 0 || rc.b !== 0 || rc.c !== 0 || rc.d !== 0;
            
            if (isMoving && !rcInterval) {
                // Sende den Befehl 20 mal pro Sekunde (50ms) an die Drohne, 
                // da die Tello den Befehl vergisst, wenn er nicht wiederholt wird
                rcInterval = setInterval(sendRcCommand, 50);
            } else if (!isMoving && rcInterval) {
                // Keine Bewegung mehr -> Intervall stoppen
                clearInterval(rcInterval);
                rcInterval = null;
                // Zur Sicherheit noch ein letztes Mal nullen
                sendRcCommand();
            }
        });

        socket.on('disconnect', () => {
            console.log('\n[Web] Benutzer hat die Verbindung getrennt.');
            // Sicherer Halt, wenn der Browser geschlossen wird!
            currentRC = { a: 0, b: 0, c: 0, d: 0 };
            sendRcCommand();
            if (rcInterval) {
                clearInterval(rcInterval);
                rcInterval = null;
            }
        });
    });

    const PORT = 3000;
    const WS_PORT = 3001;

    // WebSocket Server für den Videostream
    const wsServer = new WebSocket.Server({ port: WS_PORT }, () => {
        console.log(` Video WebSocket Server läuft auf Port ${WS_PORT}`);
    });
    
    wsServer.on('connection', (ws) => {
        console.log(`[Video] Browser verbunden.`);
        ws.on('close', () => console.log(`[Video] Browser getrennt.`));
    });

    // FFmpeg starten, um Tello UDP-Stream auf WebSocket umzuleiten
    const ffmpegArgs = [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', 'udp://0.0.0.0:11111',
        '-f', 'mpegts',
        '-codec:v', 'mpeg1video',
        '-s', '960x720',
        '-b:v', '800k',
        '-r', '30',
        '-bf', '0',
        '-'
    ];
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    ffmpeg.stdout.on('data', (data) => {
        wsServer.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });

    ffmpeg.stderr.on('data', (data) => {
        // FFmpeg gibt manchmal Infos auf stderr aus, auch wenn es kein Error ist
        // console.error(`[FFmpeg]: ${data}`);
    });

    ffmpeg.on('close', (code) => {
        console.log(`[FFmpeg] beendet mit Code ${code}`);
    });

    server.listen(PORT, () => {
        console.log(`\n=================================================`);
        console.log(` Web Control Server läuft!`);
        console.log(` Öffne in deinem Browser: http://localhost:${PORT}`);
        console.log(`=================================================\n`);
    });
}

// Skript ausführen
run();
