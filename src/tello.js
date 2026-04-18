const dgram = require('dgram');
const settings = require('./config/settings.json');

class Tello {
    constructor() {
        this.HOST = settings.ip || '192.168.10.1';
        this.PORT = settings.port || 8889;
        this.client = dgram.createSocket('udp4');
        this.pendingCommand = null;

        this.client.bind(this.PORT);

        this.client.on('message', (msg, info) => {
            const response = msg.toString().trim();
            console.log(`[Tello]: ${response}`);

            // Wenn wir auf eine Antwort warten, lösen wir das Promise auf
            if (this.pendingCommand) {
                this.pendingCommand.resolve(response);
                if (this.pendingCommand.timeout) {
                    clearTimeout(this.pendingCommand.timeout);
                }
                this.pendingCommand = null;
            }
        });

        this.client.on('error', (err) => {
            console.error(`Socket Fehler:\n${err.stack}`);
            this.client.close();
        });
    }

    send(command) {
        return new Promise((resolve, reject) => {
            const message = Buffer.from(command);

            // Setze den pendingCommand auf, um auf die Antwort auf Port 8889 zu warten
            this.pendingCommand = {
                resolve: resolve,
                timeout: setTimeout(() => {
                    console.log(`[Warnung] Zeitüberschreitung beim Warten auf eine Antwort für: ${command}`);
                    this.pendingCommand = null;
                    resolve('timeout');
                }, 15000) // Max 15 Sekunden auf eine Antwort (z.B. bei start/landen) warten
            };

            this.client.send(message, 0, message.length, this.PORT, this.HOST, (err) => {
                if (err) {
                    if (this.pendingCommand && this.pendingCommand.timeout) {
                        clearTimeout(this.pendingCommand.timeout);
                    }
                    this.pendingCommand = null;
                    reject(err);
                } else {
                    console.log(`[Sende] -> ${command}`);
                }
            });
        });
    }

    async init() {
        // SDK Modus aktivieren
        await this.send('command');
    }

    close() {
        this.client.close();
    }
}

module.exports = Tello;
