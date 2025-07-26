const isProd = process.env.NODE_ENV === 'production';

export const log = (...args) => {
  if (!isProd) {
    console.log(...args);
  }
};

export const error = (...args) => {
  console.error(...args);
};
