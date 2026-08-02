type LogLevel = "info" | "warn" | "error" | "debug";

interface LogPayload {
  [key: string]: unknown;
}

interface Logger {
  info: (payload: LogPayload, msg: string) => void;
  warn: (payload: LogPayload, msg: string) => void;
  error: (payload: LogPayload, msg: string) => void;
  debug: (payload: LogPayload, msg: string) => void;
}

function makeLogger(component?: string): Logger {
  const prefix = component ? { component } : {};
  const emit =
    (level: LogLevel) =>
    (payload: LogPayload, msg: string) => {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        ...prefix,
        ...payload,
        msg,
      });
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    };
  return {
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
    debug: emit("debug"),
  };
}

/** Process-wide logger (structured JSON lines, single-line per event). */
export const logger = makeLogger();

/** Scoped logger that tags every line with a component name. */
export function childLogger(component: string): Logger {
  return makeLogger(component);
}
