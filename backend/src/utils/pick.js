export const pick = (source, keys) => {
  const data = {};

  for (const key of keys) {
    if (source?.[key] !== undefined) {
      data[key] = source[key];
    }
  }

  return data;
};
