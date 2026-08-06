// eslint-disable-next-line no-unused-vars, unused-imports/no-unused-vars
class Magnet {
  static zhReg = /中文|中字|字幕|\[[a-z]?hdc[a-z]?\]|[-_\s]+(uc|c|ch|cu|zh)(?![a-z])/i;
  // Keep release-state signals independent: a page's uncensored classification
  // and a leaked release are not crack indicators.
  static crackReg = /破解|解密版|restored|破[\u4E00-\u9FC6]版/i;
  static leakReg = /uncensored[\s._-]*leaked|\buncen\b|無碼流出|流出/i;

  static useTransByte() {
    const rules = [
      { unit: /byte/i, trans: (size) => size },
      { unit: /kb/i, trans: (size) => size * 1000 },
      { unit: /mb/i, trans: (size) => size * 1000 ** 2 },
      { unit: /gb/i, trans: (size) => size * 1000 ** 3 },
      { unit: /tb/i, trans: (size) => size * 1000 ** 4 },
      { unit: /pb/i, trans: (size) => size * 1000 ** 5 },
      { unit: /eb/i, trans: (size) => size * 1000 ** 6 },
      { unit: /zb/i, trans: (size) => size * 1000 ** 7 },
      { unit: /yb/i, trans: (size) => size * 1000 ** 8 },
      { unit: /kib/i, trans: (size) => size * 1024 },
      { unit: /mib/i, trans: (size) => size * 1024 ** 2 },
      { unit: /gib/i, trans: (size) => size * 1024 ** 3 },
      { unit: /tib/i, trans: (size) => size * 1024 ** 4 },
      { unit: /pib/i, trans: (size) => size * 1024 ** 5 },
      { unit: /eib/i, trans: (size) => size * 1024 ** 6 },
      { unit: /zib/i, trans: (size) => size * 1024 ** 7 },
      { unit: /yib/i, trans: (size) => size * 1024 ** 8 },
    ];
    return (str) => {
      const num = str.match(/\d+\.\d+|\d+/)?.[0] ?? 0;
      if (num <= 0) return 0;
      const rule = rules.find(({ unit }) => unit.test(str));
      return rule ? rule.trans(num).toFixed(2) : 0;
    };
  }

  static magnetSort = (a, b) => {
    if (a.zh !== b.zh) return a.zh ? -1 : 1;
    if (a.crack !== b.crack) return a.crack ? -1 : 1;
    return Number.parseFloat(b.size) - Number.parseFloat(a.size);
  };
}
