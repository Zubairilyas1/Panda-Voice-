// Structured logging utility for Observability
class Logger {
    constructor(moduleName) {
        this.moduleName = moduleName;
    }

    _log(level, action, details) {
        const timestamp = new Date().toISOString();
        const payload = {
            timestamp,
            module: this.moduleName,
            action,
            ...details
        };
        
        switch(level) {
            case 'info': console.log(JSON.stringify(payload)); break;
            case 'warn': console.warn(JSON.stringify(payload)); break;
            case 'error': console.error(JSON.stringify(payload)); break;
        }
    }

    info(action, details = {}) { this._log('info', action, details); }
    warn(action, details = {}) { this._log('warn', action, details); }
    error(action, details = {}) { this._log('error', action, details); }
}
