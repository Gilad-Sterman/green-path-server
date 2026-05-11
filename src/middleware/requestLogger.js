const METHOD_COLORS = {
  GET:    '\x1b[34m',  // blue
  POST:   '\x1b[32m',  // green
  PUT:    '\x1b[33m',  // yellow
  PATCH:  '\x1b[33m',  // yellow
  DELETE: '\x1b[31m',  // red
};

const statusColor = (code) => {
  if (code >= 500) return '\x1b[31m';  // red
  if (code >= 400) return '\x1b[33m';  // yellow
  if (code >= 300) return '\x1b[36m';  // cyan
  return '\x1b[32m';                   // green
};

const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';

export const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms       = Number(process.hrtime.bigint() - start) / 1_000_000;
    const method   = req.method;
    const url      = req.originalUrl;
    const status   = res.statusCode;
    const mColor   = METHOD_COLORS[method] || '\x1b[37m';
    const sColor   = statusColor(status);
    const time     = ms < 1000 ? `${ms.toFixed(1)}ms` : `${(ms / 1000).toFixed(2)}s`;

    console.log(
      `${DIM}${new Date().toISOString()}${RESET}  ` +
      `${mColor}${method.padEnd(6)}${RESET}  ` +
      `${url.padEnd(40)}  ` +
      `${sColor}${status}${RESET}  ` +
      `${DIM}${time}${RESET}`
    );
  });

  next();
};
