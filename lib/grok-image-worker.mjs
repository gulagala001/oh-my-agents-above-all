// Bundled codec; versions, original hashes, licenses and memory-limit adaptation: src/presets/grok/codec-sources.json

// src/presets/grok/image-worker.mjs
import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";

// ../../../omaa/node_modules/.pnpm/@imagemagick+magick-wasm@0.0.45/node_modules/@imagemagick/magick-wasm/dist/index.js
function e(e30) {
  return e30 instanceof Int8Array || e30 instanceof Uint8Array || e30 instanceof Uint8ClampedArray;
}
var t = class {
  fileName;
  data;
  constructor(e30, t3) {
    this.fileName = e30, this.data = t3;
  }
};
var n = { XmlResourceFiles: {
  log: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE logmap [\n<!ELEMENT logmap (log)+>\n<!ELEMENT log (#PCDATA)>\n<!ATTLIST log events CDATA #IMPLIED>\n<!ATTLIST log output CDATA #IMPLIED>\n<!ATTLIST log filename CDATA #IMPLIED>\n<!ATTLIST log generations CDATA #IMPLIED>\n<!ATTLIST log limit CDATA #IMPLIED>\n<!ATTLIST log format CDATA #IMPLIED>\n]>\n<logmap>\n  <log events="None"/>\n  <log output="Debug"/>\n  <log filename="Magick-%g.log"/>\n  <log generations="3"/>\n  <log limit="2000"/>\n  <log format="%t %r %u %v %d %c[%p]: %m/%f/%l/%d\n  %e"/>\n</logmap>\n',
  policy: '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE policymap [\n<!ELEMENT policymap (policy)*>\n<!ATTLIST policymap xmlns CDATA #FIXED "">\n<!ELEMENT policy EMPTY>\n<!ATTLIST policy xmlns CDATA #FIXED "">\n<!ATTLIST policy domain NMTOKEN #REQUIRED>\n<!ATTLIST policy name NMTOKEN #IMPLIED>\n<!ATTLIST policy pattern CDATA #IMPLIED>\n<!ATTLIST policy rights NMTOKEN #IMPLIED>\n<!ATTLIST policy stealth NMTOKEN #IMPLIED>\n<!ATTLIST policy value CDATA #IMPLIED>\n]>\n<policymap>\n  <policy domain="cache" name="shared-secret" value="passphrase"/>\n  <policy domain="coder" rights="none" pattern="EPHEMERAL" />\n  <policy domain="coder" rights="none" pattern="MVG" />\n  <policy domain="coder" rights="none" pattern="MSL" />\n  <policy domain="path" rights="none" pattern="@*" />\n  <policy domain="path" rights="none" pattern="|*" />\n</policymap>\n'
} };
var r = class e2 {
  constructor() {
    this.log = new t("log.xml", n.XmlResourceFiles.log), this.policy = new t("policy.xml", n.XmlResourceFiles.policy);
  }
  static default = new e2();
  *all() {
    yield this.log, yield this.policy;
  }
  log;
  policy;
};
var p = class {
  constructor(e30, t3) {
    this.eventType = e30, this.message = t3 ?? "";
  }
  eventType;
  message;
};
var m = {
  Undefined: 0,
  Activate: 1,
  Associate: 2,
  Background: 3,
  Copy: 4,
  Deactivate: 5,
  Discrete: 6,
  Disassociate: 7,
  Extract: 8,
  Off: 9,
  On: 10,
  Opaque: 11,
  Remove: 12,
  Set: 13,
  Shape: 14,
  Transparent: 15,
  OffIfOpaque: 16
};
var h = {
  Red: 0,
  Cyan: 0,
  Gray: 0,
  Green: 1,
  Magenta: 1,
  Blue: 2,
  Yellow: 2,
  Black: 3,
  Alpha: 4,
  Index: 5,
  Meta0: 10,
  Meta1: 11,
  Meta2: 12,
  Meta3: 13,
  Meta4: 14,
  Meta5: 15,
  Meta6: 16,
  Meta7: 17,
  Meta8: 18,
  Meta9: 19,
  Meta10: 20,
  Meta11: 21,
  Meta12: 22,
  Meta13: 23,
  Meta14: 24,
  Meta15: 25,
  Meta16: 26,
  Meta17: 27,
  Meta18: 28,
  Meta19: 29,
  Meta20: 30,
  Meta21: 31,
  Meta22: 32,
  Meta23: 33,
  Meta24: 34,
  Meta25: 35,
  Meta26: 36,
  Meta27: 37,
  Meta28: 38,
  Meta29: 39,
  Meta30: 40,
  Meta31: 41,
  Meta32: 42,
  Meta33: 43,
  Meta34: 44,
  Meta35: 45,
  Meta36: 46,
  Meta37: 47,
  Meta38: 48,
  Meta39: 49,
  Meta40: 50,
  Meta41: 51,
  Meta42: 52,
  Meta43: 53,
  Meta44: 54,
  Meta45: 55,
  Meta46: 56,
  Meta47: 57,
  Meta48: 58,
  Meta49: 59,
  Meta50: 60,
  Meta51: 61,
  Meta52: 62,
  Composite: 64
};
var g = {
  Undefined: 0,
  Red: 1,
  Gray: 1,
  Cyan: 1,
  Green: 2,
  Magenta: 2,
  Blue: 4,
  Yellow: 4,
  Black: 8,
  Alpha: 16,
  Opacity: 16,
  Index: 32,
  Composite: 31,
  TrueAlpha: 256,
  get RGB() {
    return this.Red | this.Green | this.Blue;
  },
  get CMYK() {
    return this.Cyan | this.Magenta | this.Yellow | this.Black;
  },
  get CMYKA() {
    return this.Cyan | this.Magenta | this.Yellow | this.Black | this.Alpha;
  },
  Meta0: 1 << h.Meta0,
  Meta1: 1 << h.Meta1,
  Meta2: 1 << h.Meta2,
  Meta3: 1 << h.Meta3,
  Meta4: 1 << h.Meta4,
  Meta5: 1 << h.Meta5,
  Meta6: 1 << h.Meta6,
  Meta7: 1 << h.Meta7,
  Meta8: 1 << h.Meta8,
  Meta9: 1 << h.Meta9,
  Meta10: 1 << h.Meta10,
  Meta11: 1 << h.Meta11,
  Meta12: 1 << h.Meta12,
  Meta13: 1 << h.Meta13,
  Meta14: 1 << h.Meta14,
  Meta15: 1 << h.Meta15,
  Meta16: 1 << h.Meta16,
  Meta17: 1 << h.Meta17,
  Meta18: 1 << h.Meta18,
  Meta19: 1 << h.Meta19,
  Meta20: 1 << h.Meta20,
  Meta21: 1 << h.Meta21,
  All: 134217727
};
var ee = class {
  constructor(e30, t3, n2, r2) {
    this.red = e30, this.green = t3, this.blue = n2, this.white = r2;
  }
  red;
  green;
  blue;
  white;
};
var _ = {
  Undefined: 0,
  CMY: 1,
  CMYK: 2,
  Gray: 3,
  HCL: 4,
  HCLp: 5,
  HSB: 6,
  HSI: 7,
  HSL: 8,
  HSV: 9,
  HWB: 10,
  Lab: 11,
  LCH: 12,
  LCHab: 13,
  LCHuv: 14,
  Log: 15,
  LMS: 16,
  Luv: 17,
  OHTA: 18,
  Rec601YCbCr: 19,
  Rec709YCbCr: 20,
  RGB: 21,
  scRGB: 22,
  sRGB: 23,
  Transparent: 24,
  XyY: 25,
  XYZ: 26,
  YCbCr: 27,
  YCC: 28,
  YDbDr: 29,
  YIQ: 30,
  YPbPr: 31,
  YUV: 32,
  LinearGray: 33,
  Jzazbz: 34,
  DisplayP3: 35,
  Adobe98: 36,
  ProPhoto: 37,
  Oklab: 38,
  Oklch: 39,
  CAT02LMSC: 40
};
var te = {
  [_.Undefined]: "Undefined",
  [_.CMY]: "CMY",
  [_.CMYK]: "CMYK",
  [_.Gray]: "Gray",
  [_.HCL]: "HCL",
  [_.HCLp]: "HCLp",
  [_.HSB]: "HSB",
  [_.HSI]: "HSI",
  [_.HSL]: "HSL",
  [_.HSV]: "HSV",
  [_.HWB]: "HWB",
  [_.Lab]: "Lab",
  [_.LCH]: "LCH",
  [_.LCHab]: "LCHab",
  [_.LCHuv]: "LCHuv",
  [_.Log]: "Log",
  [_.LMS]: "LMS",
  [_.Luv]: "Luv",
  [_.OHTA]: "OHTA",
  [_.Rec601YCbCr]: "Rec601YCbCr",
  [_.Rec709YCbCr]: "Rec709YCbCr",
  [_.RGB]: "RGB",
  [_.scRGB]: "scRGB",
  [_.sRGB]: "sRGB",
  [_.Transparent]: "Transparent",
  [_.XyY]: "XyY",
  [_.XYZ]: "XYZ",
  [_.YCbCr]: "YCbCr",
  [_.YCC]: "YCC",
  [_.YDbDr]: "YDbDr",
  [_.YIQ]: "YIQ",
  [_.YPbPr]: "YPbPr",
  [_.YUV]: "YUV",
  [_.LinearGray]: "LinearGray",
  [_.Jzazbz]: "Jzazbz",
  [_.DisplayP3]: "DisplayP3",
  [_.Adobe98]: "Adobe98",
  [_.ProPhoto]: "ProPhoto",
  [_.Oklab]: "Oklab",
  [_.Oklch]: "Oklch",
  [_.CAT02LMSC]: "CAT02LMS"
};
var ne = class {
  colorSpace = _.Undefined;
  copyright = null;
  description = null;
  manufacturer = null;
  model = null;
};
var re = class {
  _data;
  _index;
  constructor(e30) {
    this._data = e30, this._index = 0, this.isLittleEndian = false;
  }
  get index() {
    return this._index;
  }
  isLittleEndian;
  readLong() {
    return this.canRead(4) ? this.isLittleEndian ? this.readLongLSB() : this.readLongMSB() : null;
  }
  readString(e30) {
    if (e30 == 0) return "";
    if (!this.canRead(e30)) return null;
    let t3 = new TextDecoder("utf-8").decode(this._data.subarray(this._index, this._index + e30)), n2 = t3.indexOf("\0");
    return n2 != -1 && (t3 = t3.substring(0, n2)), this._index += e30, t3;
  }
  seek(e30) {
    return e30 >= this._data.length ? false : (this._index = e30, true);
  }
  skip(e30) {
    return this._index + e30 >= this._data.length ? false : (this._index += e30, true);
  }
  canRead(e30) {
    return e30 > this._data.length ? false : this._index + e30 <= this._data.length;
  }
  readLongLSB() {
    let e30 = this._data[this._index];
    return e30 |= this._data[this._index + 1] << 8, e30 |= this._data[this._index + 2] << 16, e30 |= this._data[this._index + 3] << 24, this._index += 4, e30;
  }
  readLongMSB() {
    let e30 = this._data[this._index] << 24;
    return e30 |= this._data[this._index + 1] << 16, e30 |= this._data[this._index + 2] << 8, e30 |= this._data[this._index + 3], this._index += 4, e30;
  }
};
var v = class e3 {
  _data = new ne();
  _reader;
  constructor(e30) {
    this._reader = new re(e30);
  }
  static read(t3) {
    let n2 = new e3(t3);
    return n2.readColorSpace(), n2.readTagTable(), n2._data;
  }
  readColorSpace() {
    this._reader.seek(16);
    let e30 = this._reader.readString(4);
    e30 != null && (this._data.colorSpace = this.determineColorSpace(e30.trimEnd()));
  }
  determineColorSpace(e30) {
    switch (e30) {
      case "CMY":
        return _.CMY;
      case "CMYK":
        return _.CMYK;
      case "GRAY":
        return _.Gray;
      case "HSL":
        return _.HSL;
      case "HSV":
        return _.HSV;
      case "Lab":
        return _.Lab;
      case "Luv":
        return _.Luv;
      case "RGB":
        return _.sRGB;
      case "XYZ":
        return _.XYZ;
      case "YCbr":
        return _.YCbCr;
      default:
        return _.Undefined;
    }
  }
  readTagTable() {
    if (!this._reader.seek(128)) return;
    let e30 = this._reader.readLong();
    if (e30 != null) for (let t3 = 0; t3 < e30; t3++) switch (this._reader.readLong()) {
      case 1668313716:
        this._data.copyright = this.readTag();
        break;
      case 1684370275:
        this._data.description = this.readTag();
        break;
      case 1684893284:
        this._data.manufacturer = this.readTag();
        break;
      case 1684890724:
        this._data.model = this.readTag();
        break;
      default:
        this._reader.skip(8);
    }
  }
  readTag() {
    let e30 = this._reader.readLong(), t3 = this._reader.readLong();
    if (e30 === null || t3 === null) return null;
    let n2 = this._reader.index;
    if (!this._reader.seek(e30)) return null;
    let r2 = this.readTagValue(t3);
    return this._reader.seek(n2), r2;
  }
  readTagValue(e30) {
    switch (this._reader.readString(4)) {
      case "desc":
        return this.readTextDescriptionTypeValue();
      case "text":
        return this.readTextTypeValue(e30);
      default:
        return null;
    }
  }
  readTextDescriptionTypeValue() {
    if (!this._reader.skip(4)) return null;
    let e30 = this._reader.readLong();
    return e30 == null ? null : this._reader.readString(e30);
  }
  readTextTypeValue(e30) {
    return this._reader.skip(4) ? this._reader.readString(e30) : null;
  }
};
var ie = class {
  constructor(e30, t3) {
    this.name = e30, this.data = t3;
  }
  name;
  data;
};
var ae = class extends ie {
  _data;
  constructor(e30) {
    super("icc", e30);
  }
  get colorSpace() {
    return this.initialize(), this._data.colorSpace;
  }
  get copyright() {
    return this.initialize(), this._data.copyright;
  }
  get description() {
    return this.initialize(), this._data.description;
  }
  get manufacturer() {
    return this.initialize(), this._data.manufacturer;
  }
  get model() {
    return this.initialize(), this._data.model;
  }
  initialize() {
    this._data ||= v.read(this.data);
  }
};
var oe = {
  HighRes: 0,
  Quantum: 1
};
var se = class e4 {
  constructor(e30, t3) {
    this.distortion = e30, this.difference = t3;
  }
  difference;
  distortion;
  static _create(t3, n2) {
    return new e4(t3, n2);
  }
};
var ce = class {
  constructor(e30) {
    this.metric = e30;
  }
  metric;
  highlightColor;
  lowlightColor;
  masklightColor;
  _setArtifacts(e30) {
    this.highlightColor !== void 0 && e30.setArtifact("compare:highlight-color", this.highlightColor), this.lowlightColor !== void 0 && e30.setArtifact("compare:lowlight-color", this.lowlightColor), this.masklightColor !== void 0 && e30.setArtifact("compare:masklight-color", this.masklightColor);
  }
};
var le = {
  Undefined: 0,
  Alpha: 1,
  Atop: 2,
  Blend: 3,
  Blur: 4,
  Bumpmap: 5,
  ChangeMask: 6,
  Clear: 7,
  ColorBurn: 8,
  ColorDodge: 9,
  Colorize: 10,
  CopyBlack: 11,
  CopyBlue: 12,
  Copy: 13,
  CopyCyan: 14,
  CopyGreen: 15,
  CopyMagenta: 16,
  CopyAlpha: 17,
  CopyRed: 18,
  CopyYellow: 19,
  Darken: 20,
  DarkenIntensity: 21,
  Difference: 22,
  Displace: 23,
  Dissolve: 24,
  Distort: 25,
  DivideDst: 26,
  DivideSrc: 27,
  DstAtop: 28,
  Dst: 29,
  DstIn: 30,
  DstOut: 31,
  DstOver: 32,
  Exclusion: 33,
  HardLight: 34,
  HardMix: 35,
  Hue: 36,
  In: 37,
  Intensity: 38,
  Lighten: 39,
  LightenIntensity: 40,
  LinearBurn: 41,
  LinearDodge: 42,
  LinearLight: 43,
  Luminize: 44,
  Mathematics: 45,
  MinusDst: 46,
  MinusSrc: 47,
  Modulate: 48,
  ModulusAdd: 49,
  ModulusSubtract: 50,
  Multiply: 51,
  No: 52,
  Out: 53,
  Over: 54,
  Overlay: 55,
  PegtopLight: 56,
  PinLight: 57,
  Plus: 58,
  Replace: 59,
  Saturate: 60,
  Screen: 61,
  SoftLight: 62,
  SrcAtop: 63,
  Src: 64,
  SrcIn: 65,
  SrcOut: 66,
  SrcOver: 67,
  Threshold: 68,
  VividLight: 69,
  Xor: 70,
  Stereo: 71,
  Freeze: 72,
  Interpolate: 73,
  Negate: 74,
  Reflect: 75,
  SoftBurn: 76,
  SoftDodge: 77,
  Stamp: 78,
  RMSE: 79,
  SaliencyBlend: 80,
  SeamlessBlend: 81
};
var ue = {
  Warning: 300,
  ResourceLimitWarning: 300,
  TypeWarning: 305,
  OptionWarning: 310,
  DelegateWarning: 315,
  MissingDelegateWarning: 320,
  CorruptImageWarning: 325,
  FileOpenWarning: 330,
  BlobWarning: 335,
  StreamWarning: 340,
  CacheWarning: 345,
  CoderWarning: 350,
  FilterWarning: 352,
  ModuleWarning: 355,
  DrawWarning: 360,
  ImageWarning: 365,
  WandWarning: 370,
  RandomWarning: 375,
  XServerWarning: 380,
  MonitorWarning: 385,
  RegistryWarning: 390,
  ConfigureWarning: 395,
  PolicyWarning: 399,
  Error: 400,
  ResourceLimitError: 400,
  TypeError: 405,
  OptionError: 410,
  DelegateError: 415,
  MissingDelegateError: 420,
  CorruptImageError: 425,
  FileOpenError: 430,
  BlobError: 435,
  StreamError: 440,
  CacheError: 445,
  CoderError: 450,
  FilterError: 452,
  ModuleError: 455,
  DrawError: 460,
  ImageError: 465,
  WandError: 470,
  RandomError: 475,
  XServerError: 480,
  MonitorError: 485,
  RegistryError: 490,
  ConfigureError: 495,
  PolicyError: 499
};
var y = class extends Error {
  _relatedErrors = [];
  constructor(e30, t3 = ue.Error) {
    super(e30), this.severity = t3;
  }
  severity;
  get relatedErrors() {
    return this._relatedErrors;
  }
  _setRelatedErrors(e30) {
    this._relatedErrors = e30;
  }
};
var de = class {
  static get depth() {
    return Number(V._api._Quantum_Depth_Get());
  }
  static get max() {
    return V._api._Quantum_Max_Get();
  }
};
function b(e30) {
  return +!!e30;
}
function x(e30) {
  return e30 === 1;
}
function S(e30, t3) {
  return e30 === V._api._NullPointer ? t3 ?? null : fe(e30);
}
function fe(e30) {
  return V._api.UTF8ToString(Number(e30));
}
function pe(e30, t3) {
  let n2 = S(t3);
  return e30._MagickMemory_Relinquish(t3), n2;
}
function C(e30, t3, n2) {
  let r2 = e30.lengthBytesUTF8(t3) + 1, i = e30._malloc(r2);
  try {
    return e30.stringToUTF8(t3, i, r2), n2(e30._CastToSize(i));
  } finally {
    e30._free(i);
  }
}
function w(e30, t3) {
  return e30 === null ? t3(V._api._NullPointer) : C(V._api, e30, t3);
}
var T = class e5 {
  constructor(e30, t3, n2, r2, i) {
    if (e30 !== void 0) {
      if (typeof e30 == "string") {
        let t4 = V._api._NullPointer;
        try {
          t4 = V._api._MagickColor_Create(), w(e30, (e31) => {
            if (V._api._MagickColor_Initialize(t4, e31) === 0) throw new y("invalid color specified");
            this.initialize(t4);
          });
        } finally {
          V._api._free(Number(t4));
        }
      } else this.r = e30, this.g = t3 ?? 0, this.b = n2 ?? 0, i === void 0 ? this.a = r2 ?? de.max : (this.k = r2 ?? 0, this.a = i, this.isCmyk = true);
    }
  }
  r = 0;
  g = 0;
  b = 0;
  a = 0;
  k = 0;
  isCmyk = false;
  static _create(t3) {
    let n2 = new e5();
    return n2.initialize(t3), n2;
  }
  fuzzyEquals(e30, t3) {
    return e30 == this || this._use((n2) => e30._use((e31) => x(V._api._MagickColor_FuzzyEquals(n2, e31, t3._toQuantum()))));
  }
  toShortString() {
    return this.a === de.max ? this.isCmyk ? `cmyka(${this.r},${this.g},${this.b},${this.k})` : `#${this.toHex(this.r)}${this.toHex(this.g)}${this.toHex(this.b)}` : this.toString();
  }
  toString() {
    return this.isCmyk ? `cmyka(${this.r},${this.g},${this.b},${this.k},${(this.a / de.max).toFixed(4)})` : `#${this.toHex(this.r)}${this.toHex(this.g)}${this.toHex(this.b)}${this.toHex(this.a)}`;
  }
  _use(e30) {
    let t3 = V._api._NullPointer;
    try {
      return t3 = V._api._MagickColor_Create(), V._api._MagickColor_Red_Set(t3, this.r), V._api._MagickColor_Green_Set(t3, this.g), V._api._MagickColor_Blue_Set(t3, this.b), V._api._MagickColor_Alpha_Set(t3, this.a), this.isCmyk ? (V._api._MagickColor_Black_Set(t3, this.k), V._api._MagickColor_IsCMYK_Set(t3, 1)) : V._api._MagickColor_IsCMYK_Set(t3, 0), e30(t3);
    } finally {
      V._api._MagickColor_Dispose(t3);
    }
  }
  initialize(e30) {
    this.r = V._api._MagickColor_Red_Get(e30), this.g = V._api._MagickColor_Green_Get(e30), this.b = V._api._MagickColor_Blue_Get(e30), this.a = V._api._MagickColor_Alpha_Get(e30), this.isCmyk = x(V._api._MagickColor_IsCMYK_Get(e30)), this.isCmyk && (this.k = V._api._MagickColor_Black_Get(e30));
  }
  toHex(e30) {
    return e30.toString(16).padStart(2, "0");
  }
};
var me = /* @__PURE__ */ (function(e30) {
  return e30[e30.NoValue = 0] = "NoValue", e30[e30.PercentValue = 4096] = "PercentValue", e30[e30.IgnoreAspectRatio = 8192] = "IgnoreAspectRatio", e30[e30.Less = 16384] = "Less", e30[e30.Greater = 32768] = "Greater", e30[e30.FillArea = 65536] = "FillArea", e30[e30.LimitPixels = 131072] = "LimitPixels", e30[e30.AspectRatio = 1048576] = "AspectRatio", e30;
})({});
function E(e30) {
  return V._api._CastToSize(e30);
}
var D = class e6 {
  _includeXyInToString;
  _width = 0;
  _height = 0;
  _x = 0;
  _y = 0;
  _aspectRatio = false;
  _fillArea = false;
  _greater = false;
  _isPercentage = false;
  _ignoreAspectRatio = false;
  _less = false;
  _limitPixels = false;
  constructor(e30, t3, n2, r2) {
    if (typeof e30 == "string") {
      this._includeXyInToString = e30.indexOf("+") >= 0 || e30.indexOf("-") >= 0;
      let t4 = V._api._MagickGeometry_Create();
      try {
        w(e30, (n3) => {
          let r3 = V._api._MagickGeometry_Initialize(t4, n3);
          if (r3 === me.NoValue) throw new y("invalid geometry specified");
          this.hasFlag(r3, me.AspectRatio) ? this.initializeFromAspectRation(t4, e30) : this.initialize(t4, r3);
        });
      } finally {
        V._api._MagickGeometry_Dispose(t4);
      }
    } else {
      if (n2 !== void 0 && r2 !== void 0 ? (this._width = n2, this._height = r2, this._x = e30, this._y = t3 ?? 0, this._includeXyInToString = true) : (this._width = e30, this._height = t3 ?? this._width, this._x = 0, this._y = 0, this._includeXyInToString = false), this._width < 0) throw new y("negative width is not allowed");
      if (this._height < 0) throw new y("negative height is not allowed");
    }
  }
  get aspectRatio() {
    return this._aspectRatio;
  }
  get fillArea() {
    return this._fillArea;
  }
  set fillArea(e30) {
    this._fillArea = e30;
  }
  get greater() {
    return this._greater;
  }
  set greater(e30) {
    this._greater = e30;
  }
  get height() {
    return this._height;
  }
  set height(e30) {
    this._height = e30;
  }
  get ignoreAspectRatio() {
    return this._ignoreAspectRatio;
  }
  set ignoreAspectRatio(e30) {
    this._ignoreAspectRatio = e30;
  }
  get isPercentage() {
    return this._isPercentage;
  }
  set isPercentage(e30) {
    this._isPercentage = e30;
  }
  get less() {
    return this._less;
  }
  set less(e30) {
    this._less = e30;
  }
  get limitPixels() {
    return this._limitPixels;
  }
  set limitPixels(e30) {
    this._limitPixels = e30;
  }
  get width() {
    return this._width;
  }
  set width(e30) {
    this._width = e30;
  }
  get x() {
    return this._x;
  }
  set x(e30) {
    this._x = e30;
  }
  get y() {
    return this._y;
  }
  set y(e30) {
    this._y = e30;
  }
  toString() {
    if (this._aspectRatio) return this._width + ":" + this._height;
    let e30 = "";
    return this._width == 0 && this._height == 0 ? e30 += "0x0" : (this._width > 0 && (e30 += this._width.toString()), this._height > 0 ? e30 += "x" + this._height.toString() : e30 += "x"), (this._x != 0 || this._y != 0 || this._includeXyInToString) && (this._x >= 0 && (e30 += "+"), e30 += this._x, this.y >= 0 && (e30 += "+"), e30 += this.y), this._fillArea && (e30 += "^"), this._greater && (e30 += ">"), this._isPercentage && (e30 += "%"), this._ignoreAspectRatio && (e30 += "!"), this._less && (e30 += "<"), this._limitPixels && (e30 += "@"), e30;
  }
  static _fromRectangle(t3) {
    if (t3 === V._api._NullPointer) throw new y("unable to allocate memory");
    try {
      let n2 = Number(V._api._MagickRectangle_Width_Get(t3)), r2 = Number(V._api._MagickRectangle_Height_Get(t3)), i = Number(V._api._MagickRectangle_X_Get(t3)), a = Number(V._api._MagickRectangle_Y_Get(t3));
      return new e6(i, a, n2, r2);
    } finally {
      V._api._MagickRectangle_Dispose(t3);
    }
  }
  _toRectangle(e30) {
    let t3 = V._api._MagickRectangle_Create();
    if (t3 === V._api._NullPointer) throw new y("unable to allocate memory");
    try {
      return V._api._MagickRectangle_Width_Set(t3, E(this._width)), V._api._MagickRectangle_Height_Set(t3, E(this._height)), V._api._MagickRectangle_X_Set(t3, E(this._x)), V._api._MagickRectangle_Y_Set(t3, E(this._y)), e30(t3);
    } finally {
      V._api._MagickRectangle_Dispose(t3);
    }
  }
  initialize(e30, t3) {
    this._width = Number(V._api._MagickGeometry_Width_Get(e30)), this._height = Number(V._api._MagickGeometry_Height_Get(e30)), this._x = Number(V._api._MagickGeometry_X_Get(e30)), this._y = Number(V._api._MagickGeometry_Y_Get(e30)), this._ignoreAspectRatio = this.hasFlag(t3, me.IgnoreAspectRatio), this._isPercentage = this.hasFlag(t3, me.PercentValue), this._fillArea = this.hasFlag(t3, me.FillArea), this._greater = this.hasFlag(t3, me.Greater), this._less = this.hasFlag(t3, me.Less), this._limitPixels = this.hasFlag(t3, me.LimitPixels);
  }
  initializeFromAspectRation(e30, t3) {
    this._aspectRatio = true;
    let n2 = t3.split(":");
    this._width = this.parseNumber(n2[0]), this._height = this.parseNumber(n2[1]), this._x = Number(V._api._MagickGeometry_X_Get(e30)), this._y = Number(V._api._MagickGeometry_Y_Get(e30));
  }
  parseNumber(e30) {
    let t3 = 0;
    for (; t3 < e30.length && !this.isNumber(e30[t3]); ) t3++;
    let n2 = t3;
    for (; t3 < e30.length && this.isNumber(e30[t3]); ) t3++;
    return parseInt(e30.substr(n2, t3 - n2));
  }
  isNumber(e30) {
    return e30 >= "0" && e30 <= "9";
  }
  hasFlag(e30, t3) {
    return (e30 & t3) === t3;
  }
};
var he = class e7 {
  constructor(e30, t3) {
    this.x = e30, this.y = t3 ?? e30;
  }
  x;
  y;
  static _create(t3) {
    return t3 === V._api._NullPointer ? new e7(0, 0) : new e7(V._api._PointInfo_X_Get(t3), V._api._PointInfo_Y_Get(t3));
  }
};
var O = class e8 {
  constructor(e30) {
    this.area = Number(V._api._ConnectedComponent_GetArea(e30)), this.centroid = he._create(V._api._ConnectedComponent_GetCentroid(e30)), this.color = T._create(V._api._ConnectedComponent_GetColor(e30)), this.height = Number(V._api._ConnectedComponent_GetHeight(e30)), this.id = Number(V._api._ConnectedComponent_GetId(e30)), this.width = Number(V._api._ConnectedComponent_GetWidth(e30)), this.x = Number(V._api._ConnectedComponent_GetX(e30)), this.y = Number(V._api._ConnectedComponent_GetY(e30));
  }
  area;
  centroid;
  color;
  height;
  id;
  width;
  x;
  y;
  static _create(t3, n2) {
    let r2 = [];
    if (t3 === V._api._NullPointer) return r2;
    for (let i = 0; i < n2; i++) {
      let n3 = V._api._ConnectedComponent_GetInstance(t3, E(i));
      n3 === V._api._NullPointer || V._api._ConnectedComponent_GetArea(n3) < 2 ** -52 || r2.push(new e8(n3));
    }
    return r2;
  }
  toGeometry() {
    return new D(this.x, this.y, this.width, this.height);
  }
};
var ge = class {
  angleThreshold;
  areaThreshold;
  circularityThreshold;
  connectivity;
  diameterThreshold;
  eccentricityThreshold;
  majorAxisThreshold;
  meanColor;
  minorAxisThreshold;
  perimeterThreshold;
  constructor(e30) {
    this.connectivity = e30;
  }
  _setArtifacts(e30) {
    this.angleThreshold !== void 0 && e30.setArtifact("connected-components:angle-threshold", this.angleThreshold.toString()), this.areaThreshold !== void 0 && e30.setArtifact("connected-components:area-threshold", this.areaThreshold.toString()), this.circularityThreshold !== void 0 && e30.setArtifact("connected-components:circularity-threshold", this.circularityThreshold.toString()), this.diameterThreshold !== void 0 && e30.setArtifact("connected-components:diameter-threshold", this.diameterThreshold.toString()), this.eccentricityThreshold !== void 0 && e30.setArtifact("connected-components:eccentricity-threshold", this.eccentricityThreshold.toString()), this.majorAxisThreshold !== void 0 && e30.setArtifact("connected-components:major-axis-threshold", this.majorAxisThreshold.toString()), this.meanColor !== void 0 && e30.setArtifact("connected-components:mean-color", this.meanColor.toString()), this.minorAxisThreshold !== void 0 && e30.setArtifact("connected-components:minor-axis-threshold", this.minorAxisThreshold.toString()), this.perimeterThreshold !== void 0 && e30.setArtifact("connected-components:perimeter-threshold", this.perimeterThreshold.toString());
  }
};
var k = {
  Undefined: 0,
  PixelsPerInch: 1,
  PixelsPerCentimeter: 2
};
var _e = class e9 {
  constructor(e30, t3, n2) {
    t3 === void 0 ? (this.x = e30, this.y = e30, this.units = k.PixelsPerInch) : n2 === void 0 ? (this.x = e30, this.y = e30, this.units = t3) : (this.x = e30, this.y = t3, this.units = n2);
  }
  x;
  y;
  units;
  toString(t3) {
    return t3 == this.units || t3 === k.Undefined || t3 === void 0 ? e9.toString(this.x, this.y, t3 ?? k.Undefined) : this.units == k.PixelsPerCentimeter && t3 == k.PixelsPerInch ? e9.toString(this.x * 2.54, this.y * 2.54, t3) : e9.toString(this.x / 2.54, this.y / 2.54, t3);
  }
  static toString(e30, t3, n2) {
    let r2 = `${e30}x${t3}`;
    switch (n2) {
      case k.PixelsPerCentimeter:
        r2 += "cm";
        break;
      case k.PixelsPerInch:
        r2 += "inch";
    }
    return r2;
  }
};
var A = class e10 {
  static _disposeAfterExecution(t3, n2) {
    try {
      let r2 = n2(t3);
      return r2 instanceof Promise ? Promise.resolve(r2).then((n3) => (t3.dispose(), e10.checkResult(t3, n3), n3)) : (t3.dispose(), e10.checkResult(t3, r2), r2);
    } catch (e30) {
      throw t3.dispose(), e30;
    }
  }
  static checkResult(e30, t3) {
    if (t3 === e30) throw new y("The result of the function cannot be the instance that has been disposed.");
    return t3;
  }
};
var ve = class {
  _pointer;
  _bytes;
  _func;
  constructor(e30, t3, n2) {
    this._pointer = e30, this._func = n2, this._bytes = V._api.HEAPU8.subarray(Number(e30), Number(e30) + t3);
  }
  func(e30) {
    return e30._bytes === void 0 ? e30._func(/* @__PURE__ */ new Uint8Array()) : e30._func(e30._bytes);
  }
  dispose() {
    this._pointer = V._api._MagickMemory_Relinquish(this._pointer);
  }
};
var ye = class {
  instance;
  type;
  constructor(e30, t3) {
    this.instance = V._api._malloc(e30), this.type = t3, V._api.setValue(this.instance, 0, this.type);
  }
  free() {
    V._api._free(this.instance);
  }
  get ptr() {
    return V._api._CastToSize(this.instance);
  }
  get value() {
    return V._api._CastToSize(V._api.getValue(this.instance, this.type));
  }
};
var be = class e11 extends ye {
  constructor() {
    super(V._api._PointerSize, "*");
  }
  static use(t3) {
    let n2 = new e11();
    try {
      return t3(n2);
    } finally {
      n2.free();
    }
  }
};
var j = class e12 {
  pointer;
  constructor(e30) {
    this.pointer = e30;
  }
  get ptr() {
    return this.pointer.ptr;
  }
  check(e30, t3) {
    return this.isError() ? t3() : e30();
  }
  static usePointer(t3, n2) {
    return be.use((r2) => {
      let i = t3(r2.ptr);
      return e12.checkException(r2, i, n2);
    });
  }
  static use(t3, n2) {
    return be.use((r2) => {
      let i = t3(new e12(r2));
      return e12.checkException(r2, i, n2);
    });
  }
  static checkException(t3, n2, r2) {
    if (!e12.isRaised(t3)) return n2;
    let i = e12.getErrorSeverity(t3.value);
    return i >= ue.Error ? e12.throw(t3, i) : r2 === void 0 ? e12.dispose(t3) : r2(e12.createError(t3.value, i)), n2;
  }
  isError() {
    return e12.isRaised(this.pointer) ? e12.getErrorSeverity(this.pointer.value) >= ue.Error : false;
  }
  static getErrorSeverity(e30) {
    return V._api._MagickExceptionHelper_Severity(e30);
  }
  static isRaised(e30) {
    return e30.value !== V._api._NullPointer;
  }
  static throw(t3, n2) {
    let r2 = e12.createError(t3.value, n2);
    throw e12.dispose(t3), r2;
  }
  static createError(t3, n2) {
    let r2 = new y(e12.getMessage(t3), n2), i = V._api._MagickExceptionHelper_RelatedCount(t3);
    if (i === V._api._NullPointer) return r2;
    let a = [];
    for (let n3 = 0; n3 < i; n3++) {
      let r3 = V._api._MagickExceptionHelper_Related(t3, E(n3)), i2 = e12.getErrorSeverity(r3), o = e12.createError(r3, i2);
      a.push(o);
    }
    return r2._setRelatedErrors(a), r2;
  }
  static getMessage(e30) {
    let t3 = V._api._MagickExceptionHelper_Message(e30), n2 = V._api._MagickExceptionHelper_Description(e30), r2 = S(t3, "Unknown error");
    return n2 !== V._api._NullPointer && (r2 += `(${fe(n2)})`), r2;
  }
  static dispose(e30) {
    V._api._MagickExceptionHelper_Dispose(e30.value);
  }
};
var xe = class {
  disposeMethod;
  instance;
  constructor(e30, t3) {
    this.instance = e30, this.disposeMethod = t3;
  }
  get _instance() {
    if (this.instance !== V._api._NullPointer) return this.instance;
    throw new y("instance is disposed");
  }
  set _instance(e30) {
    this.disposeInstance(this.instance), this.instance = e30;
  }
  dispose() {
    this.instance = this.disposeInstance(this.instance);
  }
  _setInstance(e30, t3) {
    return t3.check(() => this.instance !== V._api._NullPointer && (this.dispose(), this.instance = e30, true), () => (this.disposeInstance(e30), true));
  }
  disposeInstance(e30) {
    return e30 > 0 && (this.onDispose !== void 0 && this.onDispose(), this.disposeMethod(e30)), V._api._NullPointer;
  }
};
var Se = class e13 {
  constructor(e30, t3, n2, r2, i, a, o) {
    this.ascent = e30, this.descent = t3, this.maxHorizontalAdvance = n2, this.textHeight = r2, this.textWidth = i, this.underlinePosition = a, this.underlineThickness = o;
  }
  ascent;
  descent;
  maxHorizontalAdvance;
  textHeight;
  textWidth;
  underlinePosition;
  underlineThickness;
  static _create(t3) {
    if (t3 === V._api._NullPointer) return null;
    try {
      let n2 = V._api._TypeMetric_Ascent_Get(t3), r2 = V._api._TypeMetric_Descent_Get(t3), i = V._api._TypeMetric_MaxHorizontalAdvance_Get(t3), a = V._api._TypeMetric_TextHeight_Get(t3), o = V._api._TypeMetric_TextWidth_Get(t3), s = V._api._TypeMetric_UnderlinePosition_Get(t3), c = V._api._TypeMetric_UnderlineThickness_Get(t3);
      return new e13(n2, r2, i, a, o, s, c);
    } finally {
      V._api._TypeMetric_Dispose(t3);
    }
  }
};
function Ce(e30, t3) {
  if (e30.byteLength === 0) throw new y("The specified array cannot be empty");
  let n2 = 0;
  try {
    return n2 = V._api._malloc(e30.byteLength), V._api.HEAPU8.set(e30, n2), t3(E(n2));
  } finally {
    n2 !== 0 && V._api._free(n2);
  }
}
function we(e30, t3) {
  if (e30.length === 0) throw new y("The specified array cannot be empty");
  let n2 = e30.length * 8, r2 = 0;
  try {
    r2 = V._api._malloc(n2);
    let i = new ArrayBuffer(n2), a = new Float64Array(i);
    for (let t4 = 0; t4 < e30.length; t4++) a[t4] = e30[t4];
    return V._api.HEAPU8.set(new Int8Array(i), r2), t3(E(r2));
  } finally {
    r2 !== 0 && V._api._free(r2);
  }
}
function M(e30, t3) {
  if (e30.byteLength === 0) throw new y("The specified array cannot be empty");
  let n2 = 0;
  try {
    return n2 = V._api._malloc(e30.byteLength), V._api.HEAPU8.set(e30, n2), t3(E(n2));
  } finally {
    n2 !== 0 && V._api._free(n2);
  }
}
var Te = class e14 extends xe {
  constructor(e30) {
    let t3 = e30.settings._drawing._use((t4) => V._api._DrawingWand_Create(e30._instance, t4._instance)), n2 = V._api._DrawingWand_Dispose;
    super(t3, n2);
  }
  affine(e30, t3, n2, r2, i, a) {
    j.usePointer((o) => {
      V._api._DrawingWand_Affine(this._instance, e30, t3, n2, r2, i, a, o);
    });
  }
  borderColor(e30) {
    j.usePointer((t3) => {
      e30._use((e31) => {
        V._api._DrawingWand_BorderColor(this._instance, e31, t3);
      });
    });
  }
  color(e30, t3, n2) {
    j.usePointer((r2) => {
      V._api._DrawingWand_Color(this._instance, e30, t3, n2, r2);
    });
  }
  draw(e30) {
    e30.forEach((e31) => {
      e31.draw(this);
    }), j.usePointer((e31) => {
      V._api._DrawingWand_Render(this._instance, e31);
    });
  }
  fillColor(e30) {
    j.usePointer((t3) => {
      e30._use((e31) => {
        V._api._DrawingWand_FillColor(this._instance, e31, t3);
      });
    });
  }
  fillOpacity(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_FillOpacity(this._instance, e30, t3);
    });
  }
  fillRule(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_FillRule(this._instance, e30, t3);
    });
  }
  font(e30) {
    j.usePointer((t3) => {
      w(e30, (e31) => {
        V._api._DrawingWand_Font(this._instance, e31, t3);
      });
    });
  }
  fontPointSize(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_FontPointSize(this._instance, e30, t3);
    });
  }
  fontTypeMetrics(e30, t3) {
    return j.usePointer((n2) => w(e30, (e31) => {
      let r2 = V._api._DrawingWand_FontTypeMetrics(this._instance, e31, b(t3), n2);
      return Se._create(r2);
    }));
  }
  gravity(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_Gravity(this._instance, e30, t3);
    });
  }
  line(e30, t3, n2, r2) {
    j.usePointer((i) => {
      V._api._DrawingWand_Line(this._instance, e30, t3, n2, r2, i);
    });
  }
  pathFinish() {
    j.usePointer((e30) => {
      V._api._DrawingWand_PathFinish(this._instance, e30);
    });
  }
  pathLineToAbs(e30, t3) {
    j.usePointer((n2) => {
      V._api._DrawingWand_PathLineToAbs(this._instance, e30, t3, n2);
    });
  }
  pathLineToRel(e30, t3) {
    j.usePointer((n2) => {
      V._api._DrawingWand_PathLineToRel(this._instance, e30, t3, n2);
    });
  }
  pathMoveToAbs(e30, t3) {
    j.usePointer((n2) => {
      V._api._DrawingWand_PathMoveToAbs(this._instance, e30, t3, n2);
    });
  }
  pathMoveToRel(e30, t3) {
    j.usePointer((n2) => {
      V._api._DrawingWand_PathMoveToRel(this._instance, e30, t3, n2);
    });
  }
  pathStart() {
    j.usePointer((e30) => {
      V._api._DrawingWand_PathStart(this._instance, e30);
    });
  }
  point(e30, t3) {
    j.usePointer((n2) => {
      V._api._DrawingWand_Point(this._instance, e30, t3, n2);
    });
  }
  rectangle(e30, t3, n2, r2) {
    j.usePointer((i) => {
      V._api._DrawingWand_Rectangle(this._instance, e30, t3, n2, r2, i);
    });
  }
  roundRectangle(e30, t3, n2, r2, i, a) {
    j.usePointer((o) => {
      V._api._DrawingWand_RoundRectangle(this._instance, e30, t3, n2, r2, i, a, o);
    });
  }
  strokeColor(e30) {
    j.usePointer((t3) => {
      e30._use((e31) => {
        V._api._DrawingWand_StrokeColor(this._instance, e31, t3);
      });
    });
  }
  strokeDashArray(e30) {
    j.usePointer((t3) => {
      we(e30, (n2) => {
        V._api._DrawingWand_StrokeDashArray(this._instance, n2, E(e30.length), t3);
      });
    });
  }
  strokeDashOffset(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_StrokeDashOffset(this._instance, e30, t3);
    });
  }
  strokeWidth(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_StrokeWidth(this._instance, e30, t3);
    });
  }
  text(e30, t3, n2) {
    j.usePointer((r2) => {
      w(n2, (n3) => {
        V._api._DrawingWand_Text(this._instance, e30, t3, n3, r2);
      });
    });
  }
  textAlignment(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_TextAlignment(this._instance, e30, t3);
    });
  }
  textAntialias(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_TextAntialias(this._instance, b(e30), t3);
    });
  }
  textDecoration(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_TextDecoration(this._instance, e30, t3);
    });
  }
  textInterlineSpacing(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_TextInterlineSpacing(this._instance, e30, t3);
    });
  }
  textInterwordspacing(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_TextInterwordSpacing(this._instance, e30, t3);
    });
  }
  textKerning(e30) {
    j.usePointer((t3) => {
      V._api._DrawingWand_TextKerning(this._instance, e30, t3);
    });
  }
  textUnderColor(e30) {
    j.usePointer((t3) => {
      e30._use((e31) => {
        V._api._DrawingWand_TextUnderColor(this._instance, e31, t3);
      });
    });
  }
  static _use(t3, n2) {
    let r2 = new e14(t3);
    return A._disposeAfterExecution(r2, n2);
  }
};
var Ee = class e15 extends ye {
  constructor() {
    super(8, "double");
  }
  static use(t3) {
    let n2 = new e15();
    try {
      return t3(n2);
    } finally {
      n2.free();
    }
  }
};
var N = {
  Undefined: 0,
  Forget: 0,
  Northwest: 1,
  North: 2,
  Northeast: 3,
  West: 4,
  Center: 5,
  East: 6,
  Southwest: 7,
  South: 8,
  Southeast: 9
};
function* De(e30) {
  for (let t3 of e30) switch (t3) {
    case N.North:
      yield "north";
      break;
    case N.Northeast:
      yield "north", yield "east";
      break;
    case N.Northwest:
      yield "north", yield "west";
      break;
    case N.East:
      yield "east";
      break;
    case N.West:
      yield "west";
      break;
    case N.South:
      yield "south";
      break;
    case N.Southeast:
      yield "south", yield "east";
      break;
    case N.Southwest:
      yield "south", yield "west";
  }
}
function Oe(e30) {
  switch (e30) {
    case N.North:
      return "north";
    case N.Northeast:
      return "northeast";
    case N.Northwest:
      return "northwest";
    case N.East:
      return "east";
    case N.West:
      return "west";
    case N.South:
      return "south";
    case N.Southeast:
      return "southeast";
    case N.Southwest:
      return "southwest";
    case N.Center:
      return "center";
    default:
      return;
  }
}
var ke = class e16 {
  constructor(e30, t3, n2) {
    this.meanErrorPerPixel = e30, this.normalizedMeanError = t3, this.normalizedMaximumError = n2;
  }
  meanErrorPerPixel;
  normalizedMaximumError;
  normalizedMeanError;
  static _create(t3) {
    let n2 = V._api._MagickImage_MeanErrorPerPixel_Get(t3._instance), r2 = V._api._MagickImage_NormalizedMeanError_Get(t3._instance), i = V._api._MagickImage_NormalizedMaximumError_Get(t3._instance);
    return new e16(n2, r2, i);
  }
};
var Ae = {
  Unknown: "UNKNOWN",
  ThreeFr: "3FR",
  ThreeG2: "3G2",
  ThreeGp: "3GP",
  A: "A",
  Aai: "AAI",
  Ai: "AI",
  APng: "APNG",
  Art: "ART",
  Arw: "ARW",
  Ashlar: "ASHLAR",
  Ase: "ASE",
  Aseprite: "ASEPRITE",
  Avci: "AVCI",
  Avi: "AVI",
  Avif: "AVIF",
  Avs: "AVS",
  B: "B",
  Bayer: "BAYER",
  Bayera: "BAYERA",
  Bgr: "BGR",
  Bgra: "BGRA",
  Bgro: "BGRO",
  Bmp: "BMP",
  Bmp2: "BMP2",
  Bmp3: "BMP3",
  Brf: "BRF",
  C: "C",
  C2pa: "C2PA",
  Cal: "CAL",
  Cals: "CALS",
  Canvas: "CANVAS",
  Caption: "CAPTION",
  Cin: "CIN",
  Cip: "CIP",
  Clip: "CLIP",
  Cmyk: "CMYK",
  Cmyka: "CMYKA",
  Cr2: "CR2",
  Cr3: "CR3",
  Crw: "CRW",
  Cube: "CUBE",
  Cur: "CUR",
  Cut: "CUT",
  Data: "DATA",
  Dcm: "DCM",
  Dcr: "DCR",
  Dcraw: "DCRAW",
  Dcx: "DCX",
  Dds: "DDS",
  Dfont: "DFONT",
  Dng: "DNG",
  Dpx: "DPX",
  Dxt1: "DXT1",
  Dxt5: "DXT5",
  Epdf: "EPDF",
  Epi: "EPI",
  Eps: "EPS",
  Eps2: "EPS2",
  Eps3: "EPS3",
  Epsf: "EPSF",
  Epsi: "EPSI",
  Ept: "EPT",
  Ept2: "EPT2",
  Ept3: "EPT3",
  Erf: "ERF",
  Exr: "EXR",
  Farbfeld: "FARBFELD",
  Fax: "FAX",
  Ff: "FF",
  Fff: "FFF",
  File: "FILE",
  Fits: "FITS",
  Fl32: "FL32",
  Flv: "FLV",
  Fractal: "FRACTAL",
  Ftp: "FTP",
  Fts: "FTS",
  Ftxt: "FTXT",
  G: "G",
  G3: "G3",
  G4: "G4",
  Gif: "GIF",
  Gif87: "GIF87",
  Gradient: "GRADIENT",
  Gray: "GRAY",
  Graya: "GRAYA",
  Group4: "GROUP4",
  Hald: "HALD",
  Hdr: "HDR",
  Heic: "HEIC",
  Heif: "HEIF",
  Histogram: "HISTOGRAM",
  Hrz: "HRZ",
  Htm: "HTM",
  Html: "HTML",
  Http: "HTTP",
  Https: "HTTPS",
  Icb: "ICB",
  Ico: "ICO",
  Icon: "ICON",
  Icn: "ICN",
  Iiq: "IIQ",
  Info: "INFO",
  Inline: "INLINE",
  Ipl: "IPL",
  Isobrl: "ISOBRL",
  Isobrl6: "ISOBRL6",
  J2c: "J2C",
  J2k: "J2K",
  Jng: "JNG",
  Jnx: "JNX",
  Jp2: "JP2",
  Jpc: "JPC",
  Jpe: "JPE",
  Jpeg: "JPEG",
  Jpg: "JPG",
  Jpm: "JPM",
  Jps: "JPS",
  Jpt: "JPT",
  Json: "JSON",
  Jxl: "JXL",
  K: "K",
  K25: "K25",
  Kdc: "KDC",
  Kernel: "KERNEL",
  Label: "LABEL",
  M: "M",
  M2v: "M2V",
  M4v: "M4V",
  Mac: "MAC",
  Map: "MAP",
  Mask: "MASK",
  Mat: "MAT",
  Matte: "MATTE",
  Mdc: "MDC",
  Mef: "MEF",
  Miff: "MIFF",
  Mkv: "MKV",
  Mng: "MNG",
  Mono: "MONO",
  Mov: "MOV",
  Mos: "MOS",
  Mp4: "MP4",
  Mpc: "MPC",
  Mpeg: "MPEG",
  Mpg: "MPG",
  Mpo: "MPO",
  Mrw: "MRW",
  Msl: "MSL",
  Msvg: "MSVG",
  Mtv: "MTV",
  Mvg: "MVG",
  Nef: "NEF",
  Nrw: "NRW",
  Null: "NULL",
  O: "O",
  Ora: "ORA",
  Orf: "ORF",
  Otb: "OTB",
  Otf: "OTF",
  Pal: "PAL",
  Palm: "PALM",
  Pam: "PAM",
  Pango: "PANGO",
  Pattern: "PATTERN",
  Pbm: "PBM",
  Pcd: "PCD",
  Pcds: "PCDS",
  Pcl: "PCL",
  Pct: "PCT",
  Pcx: "PCX",
  Pdb: "PDB",
  Pdf: "PDF",
  Pdfa: "PDFA",
  Pef: "PEF",
  Pes: "PES",
  Pfa: "PFA",
  Pfb: "PFB",
  Pfm: "PFM",
  Pgm: "PGM",
  Pgx: "PGX",
  Phm: "PHM",
  Picon: "PICON",
  Pict: "PICT",
  Pix: "PIX",
  Pjpeg: "PJPEG",
  Plasma: "PLASMA",
  Png: "PNG",
  Png00: "PNG00",
  Png24: "PNG24",
  Png32: "PNG32",
  Png48: "PNG48",
  Png64: "PNG64",
  Png8: "PNG8",
  Pnm: "PNM",
  Pocketmod: "POCKETMOD",
  Ppm: "PPM",
  Ps: "PS",
  Ps2: "PS2",
  Ps3: "PS3",
  Psb: "PSB",
  Psd: "PSD",
  Ptif: "PTIF",
  Pwp: "PWP",
  Qoi: "QOI",
  R: "R",
  RadialGradient: "RADIAL-GRADIENT",
  Raf: "RAF",
  Ras: "RAS",
  Raw: "RAW",
  Rgb: "RGB",
  Rgb565: "RGB565",
  Rgba: "RGBA",
  Rgbo: "RGBO",
  Rgf: "RGF",
  Rla: "RLA",
  Rle: "RLE",
  Rmf: "RMF",
  Rw2: "RW2",
  Rwl: "RWL",
  Scr: "SCR",
  Screenshot: "SCREENSHOT",
  Sct: "SCT",
  Sf3: "SF3",
  Sfw: "SFW",
  Sgi: "SGI",
  Shtml: "SHTML",
  Six: "SIX",
  Sixel: "SIXEL",
  SparseColor: "SPARSE-COLOR",
  Sr2: "SR2",
  Srf: "SRF",
  Srw: "SRW",
  Stegano: "STEGANO",
  Sti: "STI",
  StrImg: "STRIMG",
  Sun: "SUN",
  Svg: "SVG",
  Svgz: "SVGZ",
  Text: "TEXT",
  Tga: "TGA",
  Thumbnail: "THUMBNAIL",
  Tif: "TIF",
  Tiff: "TIFF",
  Tiff64: "TIFF64",
  Tile: "TILE",
  Tim: "TIM",
  Tm2: "TM2",
  Ttc: "TTC",
  Ttf: "TTF",
  Txt: "TXT",
  Ubrl: "UBRL",
  Ubrl6: "UBRL6",
  Uil: "UIL",
  Uyvy: "UYVY",
  Vda: "VDA",
  Vicar: "VICAR",
  Vid: "VID",
  Viff: "VIFF",
  Vips: "VIPS",
  Vst: "VST",
  WebM: "WEBM",
  WebP: "WEBP",
  Wbmp: "WBMP",
  Wbinfo: "WBINFO",
  Wmv: "WMV",
  Wpg: "WPG",
  X3f: "X3F",
  Xbm: "XBM",
  Xc: "XC",
  Xcf: "XCF",
  Xpm: "XPM",
  Xps: "XPS",
  Xv: "XV",
  Y: "Y",
  Yaml: "YAML",
  Ycbcr: "YCBCR",
  Ycbcra: "YCBCRA",
  Yuv: "YUV"
};
var je = {
  Undefined: 0,
  Coalesce: 1,
  CompareAny: 2,
  CompareClear: 3,
  CompareOverlay: 4,
  Dispose: 5,
  Optimize: 6,
  OptimizeImage: 7,
  OptimizePlus: 8,
  OptimizeTrans: 9,
  RemoveDups: 10,
  RemoveZero: 11,
  Composite: 12,
  Merge: 13,
  Flatten: 14,
  Mosaic: 15,
  Trimbounds: 16
};
var Me = class extends xe {
  constructor(e30) {
    let t3 = V._api._DrawingSettings_Create(), n2 = V._api._DrawingSettings_Dispose;
    super(t3, n2);
    let r2 = e30.affine;
    r2 !== void 0 && V._api._DrawingSettings_SetAffine(this._instance, r2.scaleX, r2.scaleY, r2.shearX, r2.shearY, r2.translateX, r2.translateY), e30.borderColor !== void 0 && e30.borderColor._use((e31) => {
      V._api._DrawingSettings_BorderColor_Set(this._instance, e31);
    }), e30.fillColor !== void 0 && e30.fillColor._use((e31) => {
      V._api._DrawingSettings_FillColor_Set(this._instance, e31);
    }), e30.fillRule !== void 0 && V._api._DrawingSettings_FillRule_Set(this._instance, e30.fillRule), e30.font !== void 0 && w(W._getFontFileName(e30.font), (e31) => {
      V._api._DrawingSettings_Font_Set(this._instance, e31);
    }), e30.fontPointsize !== void 0 && V._api._DrawingSettings_FontPointsize_Set(this._instance, e30.fontPointsize), e30.strokeColor !== void 0 && e30.strokeColor._use((e31) => {
      V._api._DrawingSettings_StrokeColor_Set(this._instance, e31);
    });
    let i = e30.strokeDashArray;
    i !== void 0 && we(i, (e31) => {
      V._api._DrawingSettings_SetStrokeDashArray(this._instance, e31, E(i.length));
    }), e30.strokeDashOffset !== void 0 && V._api._DrawingSettings_StrokeDashOffset_Set(this._instance, e30.strokeDashOffset), e30.strokeWidth !== void 0 && V._api._DrawingSettings_StrokeWidth_Set(this._instance, e30.strokeWidth), e30.textAntiAlias !== void 0 && V._api._DrawingSettings_TextAntiAlias_Set(this._instance, b(e30.textAntiAlias)), e30.textGravity !== void 0 && V._api._DrawingSettings_TextGravity_Set(this._instance, e30.textGravity), e30.textKerning !== void 0 && V._api._DrawingSettings_TextKerning_Set(this._instance, e30.textKerning), e30.textUnderColor !== void 0 && e30.textUnderColor._use((e31) => {
      V._api._DrawingSettings_TextUnderColor_Set(this._instance, e31);
    });
  }
  setFillColor(e30) {
    e30 === void 0 ? V._api._DrawingSettings_FillColor_Set(this._instance, V._api._NullPointer) : e30._use((e31) => {
      V._api._DrawingSettings_FillColor_Set(this._instance, e31);
    });
  }
  setFillPattern(e30) {
    j.usePointer((t3) => {
      e30 === void 0 ? V._api._DrawingSettings_SetFillPattern(this._instance, V._api._NullPointer, t3) : V._api._DrawingSettings_SetFillPattern(this._instance, e30._instance, t3);
    });
  }
};
var Ne = class {
  affine;
  borderColor;
  backgroundColor;
  fillColor;
  fillRule;
  font;
  fontPointsize;
  strokeColor;
  strokeDashArray;
  strokeDashOffset;
  strokeWidth;
  textAntiAlias;
  textGravity;
  textKerning;
  textUnderColor;
  _use(e30) {
    let t3 = new Me(this);
    return A._disposeAfterExecution(t3, e30);
  }
};
var Pe = {
  Undefined: 0,
  EvenOdd: 1,
  NonZero: 2
};
var P = class extends xe {
  constructor(e30) {
    let t3 = V._api._MagickSettings_Create(), n2 = V._api._MagickSettings_Dispose;
    super(t3, n2), e30._colorFuzz !== void 0 && V._api._MagickSettings_SetColorFuzz(this._instance, e30._colorFuzz), e30._fileName !== void 0 && w(e30._fileName, (e31) => {
      V._api._MagickSettings_SetFileName(this._instance, e31);
    }), e30._ping && V._api._MagickSettings_SetPing(this._instance, 1), e30._quality !== void 0 && V._api._MagickSettings_SetQuality(this._instance, E(e30._quality)), e30.antiAlias !== void 0 && V._api._MagickSettings_AntiAlias_Set(this._instance, b(e30.antiAlias)), e30.backgroundColor !== void 0 && e30.backgroundColor._use((e31) => {
      V._api._MagickSettings_BackgroundColor_Set(this._instance, e31);
    }), e30.colorSpace !== void 0 && V._api._MagickSettings_ColorSpace_Set(this._instance, e30.colorSpace), e30.colorType !== void 0 && V._api._MagickSettings_ColorType_Set(this._instance, e30.colorType), e30.compression !== void 0 && V._api._MagickSettings_Compression_Set(this._instance, e30.compression), e30.debug !== void 0 && V._api._MagickSettings_Debug_Set(this._instance, b(e30.debug)), e30.density !== void 0 && w(e30.density.toString(), (e31) => {
      V._api._MagickSettings_Density_Set(this._instance, e31);
    }), e30.depth !== void 0 && V._api._MagickSettings_Depth_Set(this._instance, E(e30.depth)), e30.endian !== void 0 && V._api._MagickSettings_Endian_Set(this._instance, e30.endian), e30.fillColor !== void 0 && this.setOption("fill", e30.fillColor.toString()), e30.font !== void 0 && w(W._getFontFileName(e30.font), (e31) => {
      V._api._MagickSettings_SetFont(this._instance, e31);
    }), e30.fontPointsize !== void 0 && V._api._MagickSettings_FontPointsize_Set(this._instance, e30.fontPointsize), e30.format !== void 0 && w(e30.format, (e31) => {
      V._api._MagickSettings_Format_Set(this._instance, e31);
    }), e30.interlace !== void 0 && V._api._MagickSettings_Interlace_Set(this._instance, e30.interlace), e30.page !== void 0 && w(e30.page.toString(), (e31) => {
      V._api._MagickSettings_SetPage(this._instance, e31);
    }), e30.strokeColor !== void 0 && this.setOption("stroke", e30.strokeColor.toString()), e30.strokeWidth !== void 0 && this.setOption("strokeWidth", e30.strokeWidth.toString()), e30.textInterlineSpacing !== void 0 && this.setOption("interline-spacing", e30.textInterlineSpacing.toString()), e30.verbose !== void 0 && V._api._MagickSettings_Verbose_Set(this._instance, b(e30.verbose));
    for (let t4 in e30._options) this.setOption(t4, e30._options[t4]);
  }
  setOption(e30, t3) {
    w(e30, (e31) => {
      w(t3, (t4) => {
        V._api._MagickSettings_SetOption(this._instance, e31, t4);
      });
    });
  }
};
var F = class e17 {
  _colorFuzz;
  _drawing = new Ne();
  _fileName;
  _onArtifact;
  _options = {};
  _ping = false;
  _quality;
  get affine() {
    return this._drawing.affine;
  }
  set affine(e30) {
    this._drawing.affine = e30;
  }
  antiAlias;
  backgroundColor;
  get borderColor() {
    return this._drawing.borderColor;
  }
  set borderColor(e30) {
    this._drawing.borderColor = e30;
  }
  colorSpace;
  colorType;
  compression;
  debug;
  density;
  depth;
  endian;
  get fillColor() {
    return this._drawing.fillColor;
  }
  set fillColor(e30) {
    this.setDefineAndArtifact("fill", e30?.toString()), this._drawing.fillColor = e30;
  }
  get fillRule() {
    return this._drawing.fillRule ?? Pe.Undefined;
  }
  set fillRule(e30) {
    this._drawing.fillRule = e30;
  }
  get font() {
    return this._drawing.font;
  }
  set font(e30) {
    this._drawing.font = e30;
  }
  get fontPointsize() {
    return this._drawing.fontPointsize;
  }
  set fontPointsize(e30) {
    this._drawing.fontPointsize = e30;
  }
  format;
  interlace;
  page;
  get strokeColor() {
    return this._drawing.strokeColor;
  }
  set strokeColor(e30) {
    this._drawing.strokeColor = e30;
  }
  get strokeDashArray() {
    return this._drawing.strokeDashArray;
  }
  set strokeDashArray(e30) {
    this._drawing.strokeDashArray = e30;
  }
  get strokeDashOffset() {
    return this._drawing.strokeDashOffset;
  }
  set strokeDashOffset(e30) {
    this._drawing.strokeDashOffset = e30;
  }
  get strokeWidth() {
    return this._drawing.strokeWidth;
  }
  set strokeWidth(e30) {
    this.setDefineAndArtifact("stroke", e30?.toString()), this._drawing.strokeWidth = e30;
  }
  get textAntiAlias() {
    return this._drawing.textAntiAlias;
  }
  set textAntiAlias(e30) {
    this._drawing.textAntiAlias = e30;
  }
  textInterlineSpacing;
  get textKerning() {
    return this._drawing.textKerning;
  }
  set textKerning(e30) {
    this.setDefineAndArtifact("kerning", e30?.toString()), this._drawing.textKerning = e30;
  }
  get textGravity() {
    return this._drawing.textGravity;
  }
  set textGravity(e30) {
    this.setDefineAndArtifact("gravity", Oe(e30)), this._drawing.textGravity = e30;
  }
  get textUnderColor() {
    return this._drawing.textUnderColor;
  }
  set textUnderColor(e30) {
    this._drawing.textUnderColor = e30;
  }
  verbose;
  getDefine(e30, t3) {
    return t3 === void 0 ? this._options[e30] ?? null : this._options[`${e30}:${t3}`] ?? null;
  }
  removeDefine(e30, t3) {
    if (t3 === void 0) delete this._options[e30];
    else {
      let n2 = this.parseDefine(e30, t3);
      delete this._options[n2];
    }
  }
  setDefine(e30, t3, n2) {
    if (n2 === void 0) this._options[e30] = t3;
    else {
      let r2 = this.parseDefine(e30, t3);
      typeof n2 == "string" ? this._options[r2] = n2 : typeof n2 == "number" ? this._options[r2] = n2.toString() : this._options[r2] = n2 ? "true" : "false";
    }
  }
  setDefines(e30) {
    e30.getDefines().forEach((e31) => {
      e31 !== void 0 && this.setDefine(e31.format, e31.name, e31.value);
    });
  }
  _clone() {
    let t3 = new e17();
    return Object.assign(t3, this), t3;
  }
  _use(e30) {
    let t3 = new P(this);
    return A._disposeAfterExecution(t3, e30);
  }
  parseDefine(e30, t3) {
    return e30 === Ae.Unknown ? t3 : `${e30}:${t3}`;
  }
  setDefineAndArtifact(e30, t3) {
    t3 === void 0 ? this.removeDefine(e30) : this.setDefine(e30, t3), this._onArtifact !== void 0 && this._onArtifact(e30, t3);
  }
};
var Fe = class extends F {
  constructor(e30) {
    super(), Object.assign(this, e30);
  }
  extractArea;
  frameIndex;
  frameCount;
  height;
  get syncImageWithExifProfile() {
    let e30 = this.getDefine("exif:sync-image");
    return e30 === null || e30.toLowerCase() === "true";
  }
  set syncImageWithExifProfile(e30) {
    this.setDefine("exif:sync-image", e30.toString());
  }
  get syncImageWithTiffProperties() {
    let e30 = this.getDefine("tiff:sync-image");
    return e30 === null || e30.toLowerCase() === "true";
  }
  set syncImageWithTiffProperties(e30) {
    this.setDefine("tiff:sync-image", e30.toString());
  }
  width;
  _use(e30) {
    let t3 = new P(this), n2 = this.getSize();
    if (n2 !== "" && w(n2, (e31) => {
      V._api._MagickSettings_SetSize(t3._instance, e31);
    }), this.frameIndex !== void 0 || this.frameCount !== void 0) {
      let e31 = E(this.frameIndex ?? 0), n3 = E(this.frameCount ?? 1);
      V._api._MagickSettings_SetScene(t3._instance, e31), V._api._MagickSettings_SetNumberScenes(t3._instance, n3), w((this.frameCount === void 0 ? e31.toString() : `${e31}-${Number(e31) + Number(n3)}`).toString(), (e32) => {
        V._api._MagickSettings_SetScenes(t3._instance, e32);
      });
    }
    return this.extractArea !== void 0 && w(this.extractArea.toString(), (e31) => {
      V._api._MagickSettings_Extract_Set(t3._instance, e31);
    }), A._disposeAfterExecution(t3, e30);
  }
  getSize() {
    return this.width !== void 0 && this.height !== void 0 ? `${this.width}x${this.height}` : this.width === void 0 ? this.height === void 0 ? "" : `x${this.height}` : `${this.width}x`;
  }
};
var Ie = {
  Undefined: 0,
  No: 1,
  Riemersma: 2,
  FloydSteinberg: 3
};
var Le = class extends xe {
  constructor(e30) {
    let t3 = V._api._QuantizeSettings_Create(), n2 = V._api._QuantizeSettings_Dispose;
    super(t3, n2), V._api._QuantizeSettings_SetColors(this._instance, E(e30.colors)), V._api._QuantizeSettings_SetColorSpace(this._instance, e30.colorSpace), V._api._QuantizeSettings_SetDitherMethod(this._instance, e30.ditherMethod ?? Ie.No), V._api._QuantizeSettings_SetMeasureErrors(this._instance, b(e30.measureErrors)), V._api._QuantizeSettings_SetTreeDepth(this._instance, E(e30.treeDepth));
  }
};
var I = class {
  constructor() {
    this.colors = 256, this.colorSpace = _.Undefined, this.ditherMethod = Ie.Riemersma, this.measureErrors = false, this.treeDepth = 0;
  }
  colors;
  colorSpace;
  ditherMethod;
  measureErrors;
  treeDepth;
  _use(e30) {
    let t3 = new Le(this);
    return A._disposeAfterExecution(t3, e30);
  }
};
var Re = class e18 {
  _image;
  _names = [];
  constructor(e30) {
    this._image = e30;
  }
  setArtifact(e30, t3) {
    this._names.push(e30), this._image.setArtifact(e30, t3);
  }
  static use(t3, n2) {
    let r2 = new e18(t3);
    try {
      return n2(r2);
    } finally {
      r2.dispose();
    }
  }
  dispose() {
    for (let e30 of this._names) this._image.removeArtifact(e30);
  }
};
var ze = class e19 extends Array {
  constructor() {
    super();
  }
  static create(t3) {
    let n2 = e19.createObject();
    return t3 !== void 0 && n2.read(t3), n2;
  }
  dispose() {
    let e30 = this.pop();
    for (; e30 !== void 0; ) e30.dispose(), e30 = this.pop();
  }
  appendHorizontally(e30) {
    return this.createImage((e31, t3) => V._api._MagickImageCollection_Append(e31, 0, t3.ptr), e30);
  }
  appendVertically(e30) {
    return this.createImage((e31, t3) => V._api._MagickImageCollection_Append(e31, 1, t3.ptr), e30);
  }
  clone(t3) {
    return e19.use((e30) => {
      for (let t4 = 0; t4 < this.length; t4++) e30.push(R._clone(this[t4]));
      return t3(e30);
    });
  }
  coalesce() {
    this.replaceImages((e30, t3) => V._api._MagickImageCollection_Coalesce(e30, t3.ptr));
  }
  combine(e30, t3) {
    let n2 = t3, r2 = _.sRGB;
    return typeof e30 == "number" ? r2 = e30 : n2 = e30, this.createImage((e31, t4) => V._api._MagickImageCollection_Combine(e31, r2, t4.ptr), n2);
  }
  complex(e30, t3) {
    return Re.use(this[0], (n2) => (e30._setArtifacts(n2), this.createImage((t4, n3) => V._api._MagickImageCollection_Complex(t4, e30.complexOperator, n3.ptr), t3)));
  }
  deconstruct() {
    this.replaceImages((e30, t3) => V._api._MagickImageCollection_Deconstruct(e30, t3.ptr));
  }
  evaluate(e30, t3) {
    return this.createImage((t4, n2) => V._api._MagickImageCollection_Evaluate(t4, E(e30), n2.ptr), t3);
  }
  flatten(e30) {
    return this.mergeImages(je.Flatten, e30);
  }
  fx(e30, t3, n2) {
    this.throwIfEmpty();
    let r2 = g.All, i = n2;
    return typeof t3 == "number" ? r2 = t3 : i = t3, w(e30, (e31) => this.createImage((t4, n3) => V._api._MagickImageCollection_Fx(t4, e31, E(r2), n3.ptr), i));
  }
  merge(e30) {
    return this.mergeImages(je.Merge, e30);
  }
  montage(t3, n2) {
    return this.throwIfEmpty(), this.attachImages((r2) => {
      let i = t3._use((e30) => j.use((t4) => {
        let n3 = V._api._MagickImageCollection_Montage(r2, e30._instance, t4.ptr);
        return this.checkResult(n3, t4);
      }));
      return e19._createFromImages(i, this.getSettings(), (e30) => {
        let r3 = t3.transparentColor;
        return r3 !== void 0 && e30.forEach((e31) => {
          e31.transparent(r3);
        }), e30.merge(n2);
      });
    });
  }
  morph(e30) {
    if (this.length < 2) throw new y("operation requires at least two images");
    this.replaceImages((t3, n2) => V._api._MagickImageCollection_Morph(t3, E(e30), n2.ptr));
  }
  mosaic(e30) {
    return this.mergeImages(je.Mosaic, e30);
  }
  optimize() {
    this.replaceImages((e30, t3) => V._api._MagickImageCollection_Optimize(e30, t3.ptr));
  }
  optimizePlus() {
    this.replaceImages((e30, t3) => V._api._MagickImageCollection_OptimizePlus(e30, t3.ptr));
  }
  optimizeTransparency() {
    this.throwIfEmpty(), this.attachImages((e30) => {
      j.usePointer((t3) => {
        V._api._MagickImageCollection_OptimizeTransparency(e30, t3);
      });
    });
  }
  ping(e30, t3) {
    this.readOrPing(true, e30, t3);
  }
  polynomial(e30, t3) {
    return this.createImage((t4, n2) => we(e30, (r2) => V._api._MagickImageCollection_Polynomial(t4, r2, E(e30.length), n2.ptr)), t3);
  }
  quantize(e30) {
    this.throwIfEmpty();
    let t3 = e30 === void 0 ? new I() : e30;
    return this.attachImages((e31) => {
      t3._use((t4) => {
        j.usePointer((n2) => {
          V._api._MagickImageCollection_Quantize(e31, t4._instance, n2);
        });
      });
    }), t3.measureErrors ? ke._create(this[0]) : null;
  }
  read(e30, t3) {
    this.readOrPing(false, e30, t3);
  }
  remap(e30, t3) {
    this.throwIfEmpty();
    let n2 = t3 === void 0 ? new I() : t3;
    this.attachImages((t4) => {
      n2._use((n3) => {
        j.use((r2) => {
          V._api._MagickImageCollection_Remap(t4, n3._instance, e30._instance, r2.ptr);
        });
      });
    });
  }
  resetPage() {
    this.forEach((e30) => {
      e30.resetPage();
    });
  }
  smushHorizontal(e30, t3) {
    return this.smush(e30, false, t3);
  }
  smushVertical(e30, t3) {
    return this.smush(e30, true, t3);
  }
  trimBounds() {
    this.mergeImages(je.Trimbounds, () => {
    });
  }
  static use(t3) {
    let n2 = e19.create();
    return A._disposeAfterExecution(n2, t3);
  }
  write(e30, t3) {
    this.throwIfEmpty();
    let n2 = V._api._NullPointer, r2 = 0, i = this[0], a = this.getSettings();
    t3 === void 0 ? (t3 = e30, a.format = i.format) : a.format = e30, j.use((e31) => {
      be.use((t4) => {
        a._use((i2) => {
          this.attachImages((a2) => {
            n2 = V._api._MagickImage_WriteBlob(a2, i2._instance, t4.ptr, e31.ptr), r2 = Number(t4.value);
          });
        });
      });
    });
    let o = new ve(n2, r2, t3);
    return A._disposeAfterExecution(o, o.func);
  }
  static _createFromImages(t3, n2, r2) {
    let i = e19.createObject();
    return i.addImages(t3, n2._clone()), r2(i);
  }
  addImages(e30, t3) {
    t3.format = Ae.Unknown;
    let n2 = e30;
    for (; n2 !== V._api._NullPointer; ) {
      let e31 = V._api._MagickImage_GetNext(n2);
      V._api._MagickImage_SetNext(n2, V._api._NullPointer), this.push(R._createFromImage(n2, t3)), n2 = e31;
    }
  }
  attachImages(e30) {
    try {
      for (let e31 = 0; e31 < this.length - 1; e31++) V._api._MagickImage_SetNext(this[e31]._instance, this[e31 + 1]._instance);
      return e30(this[0]._instance);
    } finally {
      for (let e31 = 0; e31 < this.length - 1; e31++) V._api._MagickImage_SetNext(this[e31]._instance, V._api._NullPointer);
    }
  }
  checkResult(e30, t3) {
    return t3.check(() => e30, () => (V._api._MagickImageCollection_Dispose(e30), V._api._NullPointer));
  }
  static createObject() {
    return Object.create(e19.prototype);
  }
  createImage(e30, t3) {
    this.throwIfEmpty();
    let n2 = this.attachImages((t4) => j.use((n3) => {
      let r2 = e30(t4, n3);
      return this.checkResult(r2, n3);
    }));
    return R._createFromImage(n2, this.getSettings())._use(t3);
  }
  getSettings() {
    return this[0]._getSettings()._clone();
  }
  mergeImages(e30, t3) {
    return this.createImage((t4, n2) => V._api._MagickImageCollection_Merge(t4, E(e30), n2.ptr), t3);
  }
  readOrPing(e30, t3, n2) {
    this.dispose(), j.use((r2) => {
      let i = n2 === void 0 ? new Fe() : new Fe(n2);
      i._ping = e30, typeof t3 == "string" ? (i._fileName = t3, i._use((e31) => {
        let t4 = V._api._MagickImageCollection_ReadFile(e31._instance, r2.ptr);
        this.addImages(t4, i);
      })) : i._use((e31) => {
        let n3 = t3.byteLength, a = 0;
        try {
          a = V._api._malloc(n3), V._api.HEAPU8.set(t3, a);
          let o = E(a), s = V._api._MagickImageCollection_ReadBlob(e31._instance, o, V._api._NullPointer, E(n3), r2.ptr);
          this.addImages(s, i);
        } finally {
          a !== 0 && V._api._free(a);
        }
      });
    });
  }
  replaceImages(e30) {
    this.throwIfEmpty();
    let t3 = this.attachImages((t4) => j.use((n3) => {
      let r2 = e30(t4, n3);
      return this.checkResult(r2, n3);
    })), n2 = this.getSettings()._clone();
    this.dispose(), this.addImages(t3, n2);
  }
  smush(e30, t3, n2) {
    return this.createImage((n3, r2) => V._api._MagickImageCollection_Smush(n3, E(e30), b(t3), r2.ptr), n2);
  }
  throwIfEmpty() {
    if (this.length === 0) throw new y("operation requires at least one image");
  }
};
var L = class e20 {
  _value;
  constructor(e30) {
    this._value = e30;
  }
  static _fromQuantum(t3) {
    return new e20(t3 / de.max * 100);
  }
  multiply(e30) {
    return e30 * this._value / 100;
  }
  toDouble() {
    return this._value;
  }
  toString() {
    return `${parseFloat(this._value.toFixed(2))}%`;
  }
  _toQuantum() {
    return de.max * (this._value / 100);
  }
};
var Be = class {
  static use(e30, t3, n2) {
    let r2 = V._api._MagickRectangle_Create();
    try {
      V._api._MagickRectangle_X_Set(r2, E(t3.x)), V._api._MagickRectangle_Y_Set(r2, E(t3.y));
      let i = t3.width, a = t3.height;
      return t3.isPercentage && (i = new L(t3.width).multiply(e30.width), a = new L(t3.height).multiply(e30.height)), V._api._MagickRectangle_Width_Set(r2, E(i)), V._api._MagickRectangle_Height_Set(r2, E(a)), n2(r2);
    } finally {
      V._api._MagickRectangle_Dispose(r2);
    }
  }
};
var Ve = class {
  static _use(e30, t3, n2) {
    let r2 = V._api._NullPointer;
    try {
      return r2 = V._api._OffsetInfo_Create(), V._api._PrimaryInfo_X_Set(r2, e30), V._api._PrimaryInfo_Y_Set(r2, t3), n2(r2);
    } finally {
      V._api._free(Number(r2));
    }
  }
};
var He = class {
  _values;
  constructor() {
    this._values = Array(7).fill(0);
  }
  get(e30) {
    return this._values[e30];
  }
  set(e30, t3) {
    this._values[e30] = t3;
  }
};
var Ue = class e21 {
  _huPhashes = /* @__PURE__ */ new Map();
  _hash = "";
  channel;
  constructor(e30, t3, n2) {
    if (this.channel = e30, typeof n2 == "string") this.parseHash(t3, n2);
    else for (let e31 = 0; e31 < t3.length; e31++) {
      let r2 = new He();
      for (let t4 = 0; t4 < 7; t4++) {
        let i = V._api._ChannelPerceptualHash_GetHuPhash(n2, E(e31), E(t4));
        r2.set(t4, i);
      }
      this._huPhashes.set(t3[e31], r2);
    }
  }
  huPhash(e30, t3) {
    if (t3 < 0 || t3 > 6) throw new y("Invalid index specified");
    let n2 = this._huPhashes.get(e30);
    if (n2 === void 0) throw new y("Invalid color space specified");
    return n2.get(t3);
  }
  sumSquaredDistance(e30) {
    let t3 = 0;
    return this._huPhashes.forEach((n2, r2) => {
      for (let i = 0; i < 7; i++) {
        let a = n2.get(i), o = e30.huPhash(r2, i);
        t3 += (a - o) * (a - o);
      }
    }), t3;
  }
  toString() {
    return this._hash == "" && this.setHash(), this._hash;
  }
  parseHash(t3, n2) {
    this._hash = n2;
    let r2 = 0;
    for (let i of t3) {
      let t4 = new He();
      for (let i2 = 0; i2 < 7; i2++, r2 += 5) {
        let a = Number.parseInt(n2.substring(r2, r2 + 5), 16);
        if (isNaN(a)) throw new y("Invalid hash specified");
        let o = a / e21.powerOfTen(a >> 17);
        a & 65536 && (o = -o), t4.set(i2, o);
      }
      this._huPhashes.set(i, t4);
    }
  }
  static powerOfTen(e30) {
    switch (e30) {
      case 2:
        return 100;
      case 3:
        return 1e3;
      case 4:
        return 1e4;
      case 5:
        return 1e5;
      case 6:
        return 1e6;
      default:
        return 10;
    }
  }
  setHash() {
    this._hash = "", this._huPhashes.forEach((e30) => {
      for (let t3 = 0; t3 < 7; t3++) {
        let n2 = e30.get(t3), r2 = 0;
        for (; r2 < 7 && Math.abs(n2 * 10) < 65356; ) n2 *= 10, r2++;
        r2 <<= 1, r2 < 0 && (r2 |= 1), r2 = (r2 << 16) + Math.floor(n2 < 0 ? -(n2 - 0.5) : n2 + 0.5), this._hash += r2.toString(16);
      }
    });
  }
};
var We = class e22 {
  _red;
  _green;
  _blue;
  constructor(t3, n2, r2) {
    if (typeof t3 == "string") {
      let r3 = n2 ?? e22._defaultColorspaces();
      e22._validateColorSpaces(r3);
      let i = 35 * r3.length;
      if (t3.length !== 3 * i) throw new y("Invalid hash size");
      this._red = new Ue(h.Red, r3, t3.substring(0, i)), this._blue = new Ue(h.Blue, r3, t3.substring(i, i + i)), this._green = new Ue(h.Green, r3, t3.substring(i + i));
    } else this._red = t3, this._green = n2, this._blue = r2;
  }
  static _create(t3, n2, r2) {
    if (r2 === V._api._NullPointer) throw new y("The native operation failed to create an instance");
    let i = e22.createChannel(t3, n2, r2, h.Red), a = e22.createChannel(t3, n2, r2, h.Green), o = e22.createChannel(t3, n2, r2, h.Blue);
    return new e22(i, a, o);
  }
  static _defaultColorspaces() {
    return [_.XyY, _.HSB];
  }
  static _validateColorSpaces(e30) {
    if (e30.length < 1 || e30.length > 6) throw new y("Invalid number of colorspaces, the minimum is 1 and the maximum is 6");
    if (new Set(e30).size !== e30.length) throw new y("Specifying the same colorspace more than once is not allowed");
  }
  getChannel(e30) {
    switch (e30) {
      case h.Red:
        return this._red;
      case h.Green:
        return this._green;
      case h.Blue:
        return this._blue;
      default:
        return null;
    }
  }
  sumSquaredDistance(e30) {
    let t3 = e30.getChannel(h.Red), n2 = e30.getChannel(h.Green), r2 = e30.getChannel(h.Blue);
    if (t3 === null || n2 === null || r2 === null) throw new y("The other perceptual hash should contain a red, green and blue channel.");
    return this._red.sumSquaredDistance(t3) + this._green.sumSquaredDistance(n2) + this._blue.sumSquaredDistance(r2);
  }
  toString() {
    return this._red.toString() + this._green.toString() + this._blue.toString();
  }
  static createChannel(e30, t3, n2, r2) {
    return new Ue(r2, t3, V._api._PerceptualHash_GetInstance(e30._instance, n2, E(r2)));
  }
};
var Ge = class e23 extends xe {
  image;
  constructor(e30) {
    let t3 = j.usePointer((t4) => V._api._PixelCollection_Create(e30._instance, t4)), n2 = V._api._PixelCollection_Dispose;
    super(t3, n2), this.image = e30;
  }
  static _create(t3) {
    return new e23(t3);
  }
  static _use(t3, n2) {
    let r2 = new e23(t3);
    return A._disposeAfterExecution(r2, n2);
  }
  static _map(t3, n2, r2) {
    let i = new e23(t3);
    try {
      i.use(0, 0, t3.width, t3.height, n2, (e30) => {
        r2(Number(e30));
      });
    } finally {
      i.dispose();
    }
  }
  getArea(e30, t3, n2, r2) {
    return j.usePointer((i) => {
      let a = Number(V._api._PixelCollection_GetArea(this._instance, E(e30), E(t3), E(n2), E(r2), i)), o = Number(n2 * r2 * this.image.channelCount);
      return V._api.HEAPU8.subarray(a, a + o);
    });
  }
  getReadOnlyArea(e30, t3, n2, r2) {
    return j.usePointer((i) => {
      let a = Number(V._api._PixelCollection_GetReadOnlyArea(this.image._instance, E(e30), E(t3), E(n2), E(r2), i)), o = Number(n2 * r2 * this.image.channelCount);
      return V._api.HEAPU8.subarray(a, a + o);
    });
  }
  getChannelIndex(e30) {
    return this.image._channelOffset(e30);
  }
  getColor(e30, t3) {
    let n2 = this.getArea(e30, t3, 1, 1), r2 = Array.from(n2), i = this.image._channelOffset(h.Index);
    if (i >= 0 && r2.splice(i, 1), r2.length === 0) return null;
    if (r2.length === 1) return new T(r2[0], r2[0], r2[0]);
    if (r2.length === 2) return new T(r2[0], r2[0], r2[0], r2[1]);
    let a = this.image._channelOffset(h.Black) >= 0, o = this.image._channelOffset(h.Alpha) >= 0;
    return a ? r2.length === 4 || !o ? new T(r2[0], r2[1], r2[2], r2[3], de.max) : new T(r2[0], r2[1], r2[2], r2[3], r2[4]) : r2.length === 3 || !o ? new T(r2[0], r2[1], r2[2]) : new T(r2[0], r2[1], r2[2], r2[3]);
  }
  getPixel(e30, t3) {
    return this.getArea(e30, t3, 1, 1);
  }
  setArea(e30, t3, n2, r2, i) {
    j.usePointer((a) => {
      let o = i instanceof Uint8Array ? i : new Uint8Array(i);
      M(o, (i2) => {
        let s = E(o.length);
        V._api._PixelCollection_SetArea(this._instance, E(e30), E(t3), E(n2), E(r2), i2, s, a);
      });
    });
  }
  setPixel(e30, t3, n2) {
    n2 instanceof Uint8Array, this.setArea(e30, t3, 1, 1, n2);
  }
  toByteArray(e30, t3, n2, r2, i) {
    return this.use(e30, t3, n2, r2, i, (e31) => {
      if (e31 === V._api._NullPointer) return null;
      let t4 = Number(n2 * r2 * i.length), a = Number(e31);
      return V._api.HEAPU8.slice(a, a + t4);
    });
  }
  use(e30, t3, n2, r2, i, a) {
    return w(i, (i2) => j.use((o) => {
      let s = V._api._PixelCollection_ToByteArray(this._instance, E(e30), E(t3), E(n2), E(r2), i2, o.ptr);
      return o.check(() => {
        let e31 = a(s);
        return s = V._api._MagickMemory_Relinquish(s), e31;
      }, () => (s = V._api._MagickMemory_Relinquish(s), null));
    }));
  }
};
var Ke = {
  Undefined: 0,
  Average: 1,
  Brightness: 2,
  Lightness: 3,
  MS: 4,
  Rec601Luma: 5,
  Rec601Luminance: 6,
  Rec709Luma: 7,
  Rec709Luminance: 8,
  RMS: 9
};
var qe = {
  Undefined: 0,
  Average: 1,
  Average9: 2,
  Average16: 3,
  Background: 4,
  Bilinear: 5,
  Blend: 6,
  Catrom: 7,
  Integer: 8,
  Mesh: 9,
  Nearest: 10,
  Spline: 11
};
var Je = class e24 {
  constructor(e30, t3, n2) {
    this.x = e30, this.y = t3, this.z = n2;
  }
  x;
  y;
  z;
  static _create(t3) {
    return t3 === V._api._NullPointer ? new e24(0, 0, 0) : new e24(V._api._PrimaryInfo_X_Get(t3), V._api._PrimaryInfo_Y_Get(t3), V._api._PrimaryInfo_Z_Get(t3));
  }
  _use(e30) {
    let t3 = V._api._NullPointer;
    try {
      t3 = V._api._PrimaryInfo_Create(), V._api._PrimaryInfo_X_Set(t3, this.x), V._api._PrimaryInfo_Y_Set(t3, this.y), V._api._PrimaryInfo_Z_Set(t3, this.z), e30(t3);
    } finally {
      V._api._PrimaryInfo_Dispose(t3);
    }
  }
};
var Ye = class {
  channel;
  depth;
  entropy;
  kurtosis;
  maximum;
  mean;
  minimum;
  skewness;
  standardDeviation;
  constructor(e30, t3) {
    this.channel = e30, this.depth = Number(V._api._ChannelStatistics_Depth_Get(t3)), this.entropy = V._api._ChannelStatistics_Entropy_Get(t3), this.kurtosis = V._api._ChannelStatistics_Kurtosis_Get(t3), this.maximum = V._api._ChannelStatistics_Maximum_Get(t3), this.mean = V._api._ChannelStatistics_Mean_Get(t3), this.minimum = V._api._ChannelStatistics_Minimum_Get(t3), this.skewness = V._api._ChannelStatistics_Skewness_Get(t3), this.standardDeviation = V._api._ChannelStatistics_StandardDeviation_Get(t3);
  }
};
var Xe = class e25 {
  _channels = /* @__PURE__ */ new Map();
  get channels() {
    return Array.from(this._channels.keys());
  }
  composite() {
    return this._channels.get(h.Composite);
  }
  getChannel(e30) {
    let t3 = this._channels.get(e30);
    return t3 === void 0 ? null : t3;
  }
  static _create(t3, n2, r2) {
    let i = new e25();
    return t3.channels.forEach((e30) => {
      r2 >> e30 & 1 && i.addChannel(n2, e30);
    }), i.addChannel(n2, h.Composite), i;
  }
  addChannel(e30, t3) {
    let n2 = V._api._Statistics_GetInstance(e30, E(t3));
    n2 !== V._api._NullPointer && this._channels.set(t3, new Ye(t3, n2));
  }
};
var Ze = class {
  static toArray(e30) {
    if (e30 === V._api._NullPointer) return null;
    let t3 = Number(V._api._StringInfo_Datum_Get(e30)), n2 = Number(V._api._StringInfo_Length_Get(e30));
    return V._api.HEAPU8.subarray(t3, t3 + n2);
  }
};
var Qe = class {
  constructor(e30) {
    this.error = e30;
  }
  error;
};
var R = class t2 extends xe {
  _settings;
  _progress;
  _warning;
  constructor(e30, t3) {
    super(e30, V._api._MagickImage_Dispose), this._settings = t3, this._settings._onArtifact = this.onSettingsArtifactChanged.bind(this);
  }
  get animationDelay() {
    return Number(V._api._MagickImage_AnimationDelay_Get(this._instance));
  }
  set animationDelay(e30) {
    V._api._MagickImage_AnimationDelay_Set(this._instance, E(e30));
  }
  get animationIterations() {
    return Number(V._api._MagickImage_AnimationIterations_Get(this._instance));
  }
  set animationIterations(e30) {
    V._api._MagickImage_AnimationIterations_Set(this._instance, E(e30));
  }
  get animationTicksPerSecond() {
    return Number(V._api._MagickImage_AnimationTicksPerSecond_Get(this._instance));
  }
  set animationTicksPerSecond(e30) {
    V._api._MagickImage_AnimationTicksPerSecond_Set(this._instance, E(e30));
  }
  get artifactNames() {
    let e30 = [];
    V._api._MagickImage_ResetArtifactIterator(this._instance);
    let t3 = V._api._MagickImage_GetNextArtifactName(this._instance);
    for (; t3 !== V._api._NullPointer; ) e30.push(fe(t3)), t3 = V._api._MagickImage_GetNextArtifactName(this._instance);
    return e30;
  }
  get attributeNames() {
    let e30 = [];
    V._api._MagickImage_ResetAttributeIterator(this._instance);
    let t3 = V._api._MagickImage_GetNextAttributeName(this._instance);
    for (; t3 !== V._api._NullPointer; ) e30.push(fe(t3)), t3 = V._api._MagickImage_GetNextAttributeName(this._instance);
    return e30;
  }
  get backgroundColor() {
    let e30 = V._api._MagickImage_BackgroundColor_Get(this._instance);
    return T._create(e30);
  }
  set backgroundColor(e30) {
    e30._use((e31) => {
      V._api._MagickImage_BackgroundColor_Set(this._instance, e31);
    });
  }
  get baseHeight() {
    return Number(V._api._MagickImage_BaseHeight_Get(this._instance));
  }
  get baseWidth() {
    return Number(V._api._MagickImage_BaseWidth_Get(this._instance));
  }
  get blackPointCompensation() {
    return x(V._api._MagickImage_BlackPointCompensation_Get(this._instance));
  }
  set blackPointCompensation(e30) {
    V._api._MagickImage_BlackPointCompensation_Set(this._instance, b(e30));
  }
  get borderColor() {
    let e30 = V._api._MagickImage_BorderColor_Get(this._instance);
    return T._create(e30);
  }
  set borderColor(e30) {
    e30._use((e31) => {
      V._api._MagickImage_BorderColor_Set(this._instance, e31);
    });
  }
  get boundingBox() {
    return this.useExceptionPointer((e30) => {
      let t3 = V._api._MagickImage_BoundingBox_Get(this._instance, e30), n2 = D._fromRectangle(t3);
      return n2.width === 0 || n2.height === 0 ? null : n2;
    });
  }
  get channelCount() {
    return Number(V._api._MagickImage_ChannelCount_Get(this._instance));
  }
  get channels() {
    let e30 = [];
    return [
      h.Red,
      h.Green,
      h.Blue,
      h.Black,
      h.Alpha
    ].forEach((t3) => {
      V._api._MagickImage_HasChannel(this._instance, E(t3)) && e30.push(t3);
    }), e30;
  }
  get chromaticity() {
    return new ee(Je._create(V._api._MagickImage_ChromaRed_Get(this._instance)), Je._create(V._api._MagickImage_ChromaGreen_Get(this._instance)), Je._create(V._api._MagickImage_ChromaBlue_Get(this._instance)), Je._create(V._api._MagickImage_ChromaWhite_Get(this._instance)));
  }
  set chromaticity(e30) {
    e30.blue._use((e31) => V._api._MagickImage_ChromaBlue_Set(this._instance, e31)), e30.green._use((e31) => V._api._MagickImage_ChromaGreen_Set(this._instance, e31)), e30.red._use((e31) => V._api._MagickImage_ChromaRed_Set(this._instance, e31)), e30.white._use((e31) => V._api._MagickImage_ChromaWhite_Set(this._instance, e31));
  }
  get classType() {
    return Number(V._api._MagickImage_ClassType_Get(this._instance));
  }
  set classType(e30) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_ClassType_Set(this._instance, E(e30), t3);
    });
  }
  get colorFuzz() {
    return L._fromQuantum(V._api._MagickImage_ColorFuzz_Get(this._instance));
  }
  set colorFuzz(e30) {
    let t3 = e30._toQuantum();
    V._api._MagickImage_ColorFuzz_Set(this._instance, t3), this._settings._colorFuzz = t3;
  }
  get colormapSize() {
    return Number(V._api._MagickImage_ColormapSize_Get(this._instance));
  }
  set colormapSize(e30) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_ColormapSize_Set(this._instance, E(e30), t3);
    });
  }
  get colorSpace() {
    return Number(V._api._MagickImage_ColorSpace_Get(this._instance));
  }
  set colorSpace(e30) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_ColorSpace_Set(this._instance, E(e30), t3);
    });
  }
  get colorType() {
    return this.settings.colorType === void 0 ? Number(V._api._MagickImage_ColorType_Get(this._instance)) : this.settings.colorType;
  }
  set colorType(e30) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_ColorType_Set(this._instance, E(e30), t3);
    });
  }
  get comment() {
    return this.getAttribute("comment");
  }
  set comment(e30) {
    e30 === null ? this.removeAttribute("comment") : this.setAttribute("comment", e30);
  }
  get compose() {
    return Number(V._api._MagickImage_Compose_Get(this._instance));
  }
  set compose(e30) {
    V._api._MagickImage_Compose_Set(this._instance, E(e30));
  }
  get compression() {
    return Number(V._api._MagickImage_Compression_Get(this._instance));
  }
  get density() {
    return new _e(V._api._MagickImage_ResolutionX_Get(this._instance), V._api._MagickImage_ResolutionY_Get(this._instance), Number(V._api._MagickImage_ResolutionUnits_Get(this._instance)));
  }
  set density(e30) {
    V._api._MagickImage_ResolutionX_Set(this._instance, e30.x), V._api._MagickImage_ResolutionY_Set(this._instance, e30.y), V._api._MagickImage_ResolutionUnits_Set(this._instance, E(e30.units));
  }
  get depth() {
    return Number(V._api._MagickImage_Depth_Get(this._instance));
  }
  set depth(e30) {
    V._api._MagickImage_Depth_Set(this._instance, E(e30));
  }
  get endian() {
    return Number(V._api._MagickImage_Endian_Get(this._instance));
  }
  set endian(e30) {
    V._api._MagickImage_Endian_Set(this._instance, E(e30));
  }
  get fileName() {
    return S(V._api._MagickImage_FileName_Get(this._instance));
  }
  get filterType() {
    return Number(V._api._MagickImage_FilterType_Get(this._instance));
  }
  set filterType(e30) {
    V._api._MagickImage_FilterType_Set(this._instance, E(e30));
  }
  get format() {
    return S(V._api._MagickImage_Format_Get(this._instance), "");
  }
  set format(e30) {
    w(e30.toString(), (e31) => V._api._MagickImage_Format_Set(this._instance, e31));
  }
  get gamma() {
    return V._api._MagickImage_Gamma_Get(this._instance);
  }
  get gifDisposeMethod() {
    return Number(V._api._MagickImage_GifDisposeMethod_Get(this._instance));
  }
  set gifDisposeMethod(e30) {
    V._api._MagickImage_GifDisposeMethod_Set(this._instance, E(e30));
  }
  get hasAlpha() {
    return x(V._api._MagickImage_HasAlpha_Get(this._instance));
  }
  set hasAlpha(e30) {
    this.useExceptionPointer((t3) => {
      e30 && this.alpha(m.Opaque), V._api._MagickImage_HasAlpha_Set(this._instance, b(e30), t3);
    });
  }
  get height() {
    return Number(V._api._MagickImage_Height_Get(this._instance));
  }
  get interlace() {
    return Number(V._api._MagickImage_Interlace_Get(this._instance));
  }
  get isOpaque() {
    return this.useExceptionPointer((e30) => x(V._api._MagickImage_IsOpaque_Get(this._instance, e30)));
  }
  get interpolate() {
    return Number(V._api._MagickImage_Interpolate_Get(this._instance));
  }
  set interpolate(e30) {
    V._api._MagickImage_Interpolate_Set(this._instance, E(e30));
  }
  get label() {
    return this.getAttribute("label");
  }
  set label(e30) {
    e30 === null ? this.removeAttribute("label") : this.setAttribute("label", e30);
  }
  get matteColor() {
    let e30 = V._api._MagickImage_MatteColor_Get(this._instance);
    return T._create(e30);
  }
  set matteColor(e30) {
    e30._use((e31) => {
      V._api._MagickImage_MatteColor_Set(this._instance, e31);
    });
  }
  get metaChannelCount() {
    return Number(V._api._MagickImage_MetaChannelCount_Get(this._instance));
  }
  set metaChannelCount(e30) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_MetaChannelCount_Set(this._instance, E(e30), t3);
    });
  }
  get orientation() {
    return Number(V._api._MagickImage_Orientation_Get(this._instance));
  }
  set orientation(e30) {
    V._api._MagickImage_Orientation_Set(this._instance, E(e30));
  }
  get onProgress() {
    return this._progress;
  }
  set onProgress(e30) {
    e30 === void 0 ? this.disposeProgressDelegate() : rt.setProgressDelegate(this), this._progress = e30;
  }
  get onWarning() {
    return this._warning;
  }
  set onWarning(e30) {
    this._warning = e30;
  }
  get page() {
    let e30 = V._api._MagickImage_Page_Get(this._instance);
    return D._fromRectangle(e30);
  }
  set page(e30) {
    e30._toRectangle((e31) => {
      V._api._MagickImage_Page_Set(this._instance, e31);
    });
  }
  get profileNames() {
    let e30 = [];
    V._api._MagickImage_ResetProfileIterator(this._instance);
    let t3 = V._api._MagickImage_GetNextProfileName(this._instance);
    for (; t3 !== V._api._NullPointer; ) e30.push(fe(t3)), t3 = V._api._MagickImage_GetNextProfileName(this._instance);
    return e30;
  }
  get quality() {
    return Number(V._api._MagickImage_Quality_Get(this._instance));
  }
  set quality(e30) {
    let t3 = e30 < 1 ? 1 : e30;
    t3 = t3 > 100 ? 100 : t3, V._api._MagickImage_Quality_Set(this._instance, E(t3)), this._settings._quality = t3;
  }
  get renderingIntent() {
    return Number(V._api._MagickImage_RenderingIntent_Get(this._instance));
  }
  set renderingIntent(e30) {
    V._api._MagickImage_RenderingIntent_Set(this._instance, E(e30));
  }
  get settings() {
    return this._settings;
  }
  get signature() {
    return this.useExceptionPointer((e30) => S(V._api._MagickImage_Signature_Get(this._instance, e30)));
  }
  get totalColors() {
    return this.useExceptionPointer((e30) => Number(V._api._MagickImage_TotalColors_Get(this._instance, e30)));
  }
  get virtualPixelMethod() {
    return Number(V._api._MagickImage_VirtualPixelMethod_Get(this._instance));
  }
  set virtualPixelMethod(e30) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_VirtualPixelMethod_Set(this._instance, E(e30), t3);
    });
  }
  get width() {
    return Number(V._api._MagickImage_Width_Get(this._instance));
  }
  adaptiveBlur(e30, t3) {
    let n2 = this.valueOrDefault(e30, 0), r2 = this.valueOrDefault(t3, 1);
    this.useException((e31) => {
      let t4 = V._api._MagickImage_AdaptiveBlur(this._instance, n2, r2, e31.ptr);
      this._setInstance(t4, e31);
    });
  }
  adaptiveResize(e30, t3) {
    let n2 = typeof e30 == "number" ? new D(0, 0, e30, t3) : e30;
    this.useException((e31) => {
      w(n2.toString(), (t4) => {
        let n3 = V._api._MagickImage_AdaptiveResize(this._instance, t4, e31.ptr);
        this._setInstance(n3, e31);
      });
    });
  }
  adaptiveSharpen(e30, t3, n2) {
    let r2 = 0, i = t3 ?? 1, a = n2 ?? g.Undefined;
    e30 !== void 0 && (t3 === void 0 ? a = e30 : r2 = e30), this.useException((e31) => {
      let t4 = V._api._MagickImage_AdaptiveSharpen(this._instance, r2, i, E(a), e31.ptr);
      this._setInstance(t4, e31);
    });
  }
  adaptiveThreshold(e30, t3, n2, r2) {
    let i = n2 instanceof L ? n2._toQuantum() : 0, a = r2 ?? g.Undefined;
    typeof n2 == "number" && (a = n2), this.useException((n3) => {
      let r3 = V._api._MagickImage_AdaptiveThreshold(this._instance, E(e30), E(t3), i, E(a), n3.ptr);
      this._setInstance(r3, n3);
    });
  }
  addNoise(e30, t3, n2) {
    let r2 = 1, i = n2 ?? g.Undefined;
    t3 !== void 0 && (n2 === void 0 ? i = t3 : r2 = t3), this.useException((t4) => {
      let n3 = V._api._MagickImage_AddNoise(this._instance, E(e30), r2, E(i), t4.ptr);
      this._setInstance(n3, t4);
    });
  }
  affineTransform(e30) {
    this.useException((t3) => {
      let n2 = V._api._MagickImage_AffineTransform(this._instance, e30.scaleX, e30.scaleY, e30.shearX, e30.shearY, e30.translateX, e30.translateY, t3.ptr);
      this._setInstance(n2, t3);
    });
  }
  alpha(e30) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_SetAlpha(this._instance, E(e30), t3);
    });
  }
  annotate(e30, t3, n2, r2) {
    return this.useExceptionPointer((i) => this._settings._drawing._use((a) => {
      w(e30, (e31) => {
        let o = null, s = N.Undefined, c = 0;
        typeof t3 == "object" ? (o = t3.toString(), n2 !== void 0 && (s = n2), r2 !== void 0 && (c = r2)) : (s = t3, n2 !== void 0 && (c = n2)), w(o, (t4) => {
          V._api._MagickImage_Annotate(this._instance, a._instance, e31, t4, E(s), c, i);
        });
      });
    }));
  }
  autoGamma(e30) {
    this.useExceptionPointer((t3) => {
      let n2 = this.valueOrDefault(e30, g.Composite);
      V._api._MagickImage_AutoGamma(this._instance, E(n2), t3);
    });
  }
  autoLevel(e30) {
    this.useExceptionPointer((t3) => {
      let n2 = this.valueOrDefault(e30, g.Undefined);
      V._api._MagickImage_AutoLevel(this._instance, E(n2), t3);
    });
  }
  autoOrient() {
    this.useException((e30) => {
      let t3 = V._api._MagickImage_AutoOrient(this._instance, e30.ptr);
      this._setInstance(t3, e30);
    });
  }
  autoThreshold(e30) {
    this.useException((t3) => {
      V._api._MagickImage_AutoThreshold(this._instance, E(e30), t3.ptr);
    });
  }
  bilateralBlur(e30, t3, n2, r2) {
    let i = this.valueOrComputedDefault(n2, () => Math.sqrt(Number(e30 * e30 + t3 * t3))), a = this.valueOrDefault(r2, i * 0.25);
    this.useException((n3) => {
      let r3 = V._api._MagickImage_BilateralBlur(this._instance, E(e30), E(t3), i, a, n3.ptr);
      this._setInstance(r3, n3);
    });
  }
  blackThreshold(e30, t3) {
    let n2 = this.valueOrDefault(t3, g.Composite);
    this.useException((t4) => {
      w(e30.toString(), (e31) => {
        V._api._MagickImage_BlackThreshold(this._instance, e31, E(n2), t4.ptr);
      });
    });
  }
  blueShift(e30) {
    let t3 = this.valueOrDefault(e30, 1.5);
    this.useException((e31) => {
      let n2 = V._api._MagickImage_BlueShift(this._instance, t3, e31.ptr);
      this._setInstance(n2, e31);
    });
  }
  blur(e30, t3, n2) {
    let r2 = 0, i = this.valueOrDefault(t3, 1), a = this.valueOrDefault(n2, g.Undefined);
    e30 !== void 0 && (t3 === void 0 ? a = e30 : r2 = e30), this.useException((e31) => {
      let t4 = V._api._MagickImage_Blur(this._instance, r2, i, E(a), e31.ptr);
      this._setInstance(t4, e31);
    });
  }
  border(e30, t3) {
    let n2 = new D(0, 0, e30, this.valueOrDefault(t3, e30));
    this.useException((e31) => {
      n2._toRectangle((t4) => {
        let n3 = V._api._MagickImage_Border(this._instance, t4, e31.ptr);
        this._setInstance(n3, e31);
      });
    });
  }
  brightnessContrast(e30, t3, n2) {
    let r2 = this.valueOrDefault(n2, g.Undefined);
    this.useException((n3) => {
      V._api._MagickImage_BrightnessContrast(this._instance, e30.toDouble(), t3.toDouble(), E(r2), n3.ptr);
    });
  }
  cannyEdge(e30, t3, n2, r2) {
    let i = this.valueOrDefault(e30, 0), a = this.valueOrDefault(t3, 1), o = this.valueOrDefault(n2, new L(10)).toDouble() / 100, s = this.valueOrDefault(r2, new L(30)).toDouble() / 100;
    this.useException((e31) => {
      let t4 = V._api._MagickImage_CannyEdge(this._instance, i, a, o, s, e31.ptr);
      this._setInstance(t4, e31);
    });
  }
  charcoal(e30, t3) {
    let n2 = e30 === void 0 ? 0 : e30, r2 = t3 === void 0 ? 1 : t3;
    this.useException((e31) => {
      let t4 = V._api._MagickImage_Charcoal(this._instance, n2, r2, e31.ptr);
      this._setInstance(t4, e31);
    });
  }
  chop(e30) {
    this.useException((t3) => {
      e30._toRectangle((e31) => {
        let n2 = V._api._MagickImage_Chop(this._instance, e31, t3.ptr);
        this._setInstance(n2, t3);
      });
    });
  }
  chopHorizontal(e30, t3) {
    this.chop(new D(e30, 0, t3, 0));
  }
  chopVertical(e30, t3) {
    this.chop(new D(0, e30, 0, t3));
  }
  clahe(e30, t3, n2, r2) {
    this.useExceptionPointer((i) => {
      let a = E(e30 instanceof L ? e30.multiply(this.width) : e30), o = E(t3 instanceof L ? t3.multiply(this.height) : t3);
      V._api._MagickImage_Clahe(this._instance, a, o, E(n2), r2, i);
    });
  }
  clone(e30) {
    return t2._clone(this)._use(e30);
  }
  cloneArea(e30, n2) {
    return j.usePointer((r2) => e30._toRectangle((i) => Ve._use(0, 0, (a) => {
      let o = V._api._MagickImage_CloneArea(this._instance, E(e30.width), E(e30.height), r2);
      return V._api._MagickImage_CopyPixels(o, this._instance, i, a, E(g.Undefined), r2), n2(new t2(o, this._settings));
    })));
  }
  clut(e30, t3, n2) {
    let r2 = this.valueOrDefault(t3, qe.Undefined), i = this.valueOrDefault(n2, g.Undefined);
    this.useExceptionPointer((t4) => {
      V._api._MagickImage_Clut(this._instance, e30._instance, E(r2), E(i), t4);
    });
  }
  colorAlpha(e30) {
    if (!this.hasAlpha) return;
    let n2 = t2.create();
    n2.read(e30, this.width, this.height), n2.composite(this, le.SrcOver, new he(0, 0)), this._instance = n2._instance;
  }
  colorDecisionList(e30) {
    this.useExceptionPointer((t3) => {
      w(e30, (e31) => {
        V._api._MagickImage_ColorDecisionList(this._instance, e31, t3);
      });
    });
  }
  compare(e30, n2, r2, i) {
    let a = n2 instanceof ce, o = a ? n2.metric : n2, s = r2;
    i !== void 0 && (s = i);
    let c = g.Undefined;
    if (typeof s != "function") return s !== void 0 && (c = s), this.useExceptionPointer((t3) => V._api._MagickImage_CompareDistortion(this._instance, e30._instance, E(o), E(c), t3));
    r2 !== void 0 && typeof r2 != "function" && (c = r2);
    let l = Re.use(this, (r3) => (a && n2._setArtifacts(r3), Ee.use((n3) => {
      let r4 = this.useExceptionPointer((t3) => V._api._MagickImage_Compare(this._instance, e30._instance, E(o), E(c), n3.ptr, t3)), i2 = n3.value, a2 = t2._createFromImage(r4, this._settings);
      return se._create(i2, a2);
    })));
    return l.difference._use(() => s(l));
  }
  composite(e30, t3, n2, r2, i) {
    let a = 0, o = 0, s = le.In, c = g.All, l = null;
    t3 instanceof he ? (a = t3.x, o = t3.y) : t3 !== void 0 && (s = t3), n2 instanceof he ? (a = n2.x, o = n2.y) : typeof n2 == "string" ? l = n2 : n2 !== void 0 && (c = n2), typeof r2 == "string" ? l = r2 : r2 !== void 0 && (c = r2), i !== void 0 && (c = i), l !== null && this.setArtifact("compose:args", l), this.useExceptionPointer((t4) => {
      V._api._MagickImage_Composite(this._instance, e30._instance, E(a), E(o), E(s), E(c), t4);
    }), l !== null && this.removeArtifact("compose:args");
  }
  compositeGravity(e30, t3, n2, r2, i, a) {
    let o = 0, s = 0, c = le.In, l = g.All, u = null;
    n2 instanceof he ? (o = n2.x, s = n2.y) : n2 !== void 0 && (c = n2), r2 instanceof he ? (o = r2.x, s = r2.y) : typeof r2 == "string" ? u = r2 : r2 !== void 0 && (l = r2), typeof i == "string" ? u = i : i !== void 0 && (l = i), a !== void 0 && (l = a), u !== null && this.setArtifact("compose:args", u), this.useExceptionPointer((n3) => {
      V._api._MagickImage_CompositeGravity(this._instance, e30._instance, E(t3), E(o), E(s), E(c), E(l), n3);
    }), u !== null && this.removeArtifact("compose:args");
  }
  connectedComponents(e30) {
    let t3 = typeof e30 == "number" ? new ge(e30) : e30;
    return Re.use(this, (e31) => (t3._setArtifacts(e31), this.useException((e32) => be.use((n2) => {
      try {
        let r2 = V._api._MagickImage_ConnectedComponents(this._instance, E(t3.connectivity), n2.ptr, e32.ptr);
        return this._setInstance(r2, e32), O._create(n2.value, Number(this.colormapSize));
      } finally {
        n2.value !== V._api._NullPointer && V._api._ConnectedComponent_DisposeList(n2.value);
      }
    }))));
  }
  contrast = () => this.contrastPrivate(true);
  contrastStretch(e30, t3, n2) {
    let r2 = Number(this.width * this.height), i = e30.multiply(r2), a = 0, o = this.valueOrDefault(n2, g.Undefined);
    t3 instanceof L ? a = r2 - t3.multiply(r2) : (a = r2 - e30.multiply(r2), t3 !== void 0 && (o = t3)), this.useExceptionPointer((e31) => {
      V._api._MagickImage_ContrastStretch(this._instance, i, a, E(o), e31);
    });
  }
  static create(e30, n2, r2) {
    let i = new t2(t2.createInstance(), new F());
    return e30 !== void 0 && i.readOrPing(false, e30, n2, r2), i;
  }
  crop(e30, t3, n2) {
    let r2, i;
    typeof e30 == "number" ? t3 !== void 0 && (r2 = new D(e30, t3), i = this.valueOrDefault(n2, N.Undefined)) : (r2 = e30, i = this.valueOrDefault(t3, N.Undefined)), this.useException((e31) => {
      w(r2.toString(), (t4) => {
        let n3 = V._api._MagickImage_Crop(this._instance, t4, E(i), e31.ptr);
        this._setInstance(n3, e31);
      });
    });
  }
  cropToTiles(e30, t3, n2) {
    let r2, i;
    return typeof e30 == "number" && typeof t3 == "number" && n2 !== void 0 ? (r2 = new D(0, 0, e30, t3), i = n2) : typeof e30 != "number" && typeof t3 != "number" && (r2 = e30, i = t3), this.useException((e31) => w(r2.toString(), (t4) => {
      let n3 = V._api._MagickImage_CropToTiles(this._instance, t4, e31.ptr);
      return ze._createFromImages(n3, this._settings, (e32) => i(e32));
    }));
  }
  cycleColormap(e30) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_CycleColormap(this._instance, E(e30), t3);
    });
  }
  deskew(e30, t3) {
    return Re.use(this, (n2) => {
      t3 !== void 0 && n2.setArtifact("deskew:auto-crop", t3), this.useException((t4) => {
        let n3 = V._api._MagickImage_Deskew(this._instance, e30._toQuantum(), t4.ptr);
        this._setInstance(n3, t4);
      });
      let r2 = Number(this.getArtifact("deskew:angle"));
      return isNaN(r2) ? 0 : r2;
    });
  }
  determineBitDepth(e30) {
    let t3 = this.valueOrDefault(e30, g.Undefined);
    return this.useExceptionPointer((e31) => Number(V._api._MagickImage_DetermineBitDepth(this._instance, E(t3), e31)));
  }
  distort(e30, t3) {
    Re.use(this, (n2) => {
      let r2, i = 0;
      typeof e30 == "number" ? r2 = e30 : (r2 = e30.method, i = b(e30.bestFit), e30._setArtifacts(n2)), this.useException((e31) => {
        we(t3, (n3) => {
          let a = V._api._MagickImage_Distort(this._instance, E(r2), i, n3, E(t3.length), e31.ptr);
          this._setInstance(a, e31);
        });
      });
    });
  }
  draw(...e30) {
    let t3 = e30.flat();
    t3.length !== 0 && Te._use(this, (e31) => {
      e31.draw(t3);
    });
  }
  evaluate(e30, t3, n2, r2) {
    if (typeof t3 == "number") {
      let r3 = t3, i = typeof n2 == "number" ? n2 : n2._toQuantum();
      this.useExceptionPointer((t4) => {
        V._api._MagickImage_EvaluateOperator(this._instance, E(e30), E(r3), i, t4);
      });
    } else if (r2 !== void 0) {
      if (typeof n2 != "number") throw new y("this should not happen");
      let i = t3, a = n2, o = typeof r2 == "number" ? r2 : r2._toQuantum();
      if (i.isPercentage) throw new y("percentage is not supported");
      this.useExceptionPointer((t4) => {
        Be.use(this, i, (n3) => {
          V._api._MagickImage_EvaluateGeometry(this._instance, E(e30), n3, E(a), o, t4);
        });
      });
    }
  }
  extent(e30, t3, n2) {
    let r2 = N.Undefined, i;
    typeof e30 == "number" ? typeof t3 == "number" && (i = new D(e30, t3)) : i = e30, typeof t3 == "number" ? r2 = t3 : t3 !== void 0 && (this.backgroundColor = t3), typeof n2 == "number" ? r2 = n2 : n2 !== void 0 && (this.backgroundColor = n2), this.useException((e31) => {
      w(i.toString(), (t4) => {
        let n3 = V._api._MagickImage_Extent(this._instance, t4, E(r2), e31.ptr);
        this._setInstance(n3, e31);
      });
    });
  }
  flip() {
    this.useException((e30) => {
      let t3 = V._api._MagickImage_Flip(this._instance, e30.ptr);
      this._setInstance(t3, e30);
    });
  }
  floodFill(e30, t3, n2, r2) {
    this.floodFillPrivate(e30, t3, n2, r2, false);
  }
  flop() {
    this.useException((e30) => {
      let t3 = V._api._MagickImage_Flop(this._instance, e30.ptr);
      this._setInstance(t3, e30);
    });
  }
  formatExpression(e30) {
    return this.useExceptionPointer((t3) => this._settings._use((n2) => w(e30, (e31) => {
      let r2 = V._api._MagickImage_FormatExpression(this._instance, n2._instance, e31, t3);
      return pe(V._api, r2);
    })));
  }
  gammaCorrect(e30, t3) {
    let n2 = this.valueOrDefault(t3, g.Undefined);
    this.useExceptionPointer((t4) => {
      V._api._MagickImage_GammaCorrect(this._instance, e30, E(n2), t4);
    });
  }
  gaussianBlur(e30, t3, n2) {
    let r2 = this.valueOrDefault(t3, 1), i = this.valueOrDefault(n2, g.Undefined);
    this.useException((t4) => {
      let n3 = V._api._MagickImage_GaussianBlur(this._instance, e30, r2, E(i), t4.ptr);
      this._setInstance(n3, t4);
    });
  }
  getArtifact(e30) {
    return w(e30, (e31) => S(V._api._MagickImage_GetArtifact(this._instance, e31)));
  }
  getAttribute(e30) {
    return this.useException((t3) => w(e30, (e31) => S(V._api._MagickImage_GetAttribute(this._instance, e31, t3.ptr))));
  }
  getColormapColor(e30) {
    let t3 = V._api._MagickImage_GetColormapColor(this._instance, E(e30));
    return t3 === V._api._NullPointer ? null : T._create(t3);
  }
  getColorProfile() {
    for (let e30 of ["icc", "icm"]) {
      let t3 = this.getProfilePrivate(e30);
      if (t3 !== null) return new ae(t3);
    }
    return null;
  }
  getPixels(e30) {
    if (this._settings._ping) throw new y("image contains no pixel data");
    return Ge._use(this, e30);
  }
  getProfile(e30) {
    let t3 = this.getProfilePrivate(e30);
    return t3 === null ? null : new ie(e30, t3);
  }
  getWriteMask(e30) {
    let n2 = this.useExceptionPointer((e31) => V._api._MagickImage_GetWriteMask(this._instance, e31)), r2 = n2 === V._api._NullPointer ? null : new t2(n2, new F());
    return r2 == null ? e30(r2) : r2._use(e30);
  }
  grayscale(e30 = Ke.Undefined) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_Grayscale(this._instance, E(e30), t3);
    });
  }
  hasProfile(e30) {
    return w(e30, (e31) => x(V._api._MagickImage_HasProfile(this._instance, e31)));
  }
  histogram() {
    let e30 = /* @__PURE__ */ new Map();
    return this.useExceptionPointer((t3) => {
      be.use((n2) => {
        let r2 = V._api._MagickImage_Histogram(this._instance, n2.ptr, t3);
        if (r2 !== V._api._NullPointer) {
          let t4 = n2.value;
          for (let n3 = 0; n3 < t4; n3++) {
            let t5 = V._api._MagickColorCollection_Get(r2, E(n3)), i = T._create(t5), a = V._api._MagickColor_Count_Get(t5);
            e30.set(i.toString(), a);
          }
          V._api._MagickColorCollection_Dispose(r2);
        }
      });
    }), e30;
  }
  inverseContrast = () => this.contrastPrivate(false);
  inverseFloodFill(e30, t3, n2, r2) {
    this.floodFillPrivate(e30, t3, n2, r2, true);
  }
  inverseLevel(e30, t3, n2, r2) {
    let i = this.valueOrDefault(n2, 1), a = this.valueOrDefault(r2, g.Composite);
    this.useExceptionPointer((n3) => {
      V._api._MagickImage_InverseLevel(this._instance, e30.toDouble(), t3._toQuantum(), i, E(a), n3);
    });
  }
  inverseLevelColors(e30, t3, n2) {
    this.levelColorsPrivate(true, e30, t3, n2);
  }
  inverseOpaque = (e30, t3) => this.opaquePrivate(e30, t3, true);
  inverseSigmoidalContrast(e30, t3, n2) {
    this.sigmoidalContrastPrivate(false, e30, t3, n2);
  }
  inverseTransparent = (e30) => this.transparentPrivate(e30, true);
  level(e30, t3, n2, r2) {
    let i = this.valueOrDefault(n2, 1), a = this.valueOrDefault(r2, g.Composite);
    this.useExceptionPointer((n3) => {
      V._api._MagickImage_Level(this._instance, e30.toDouble(), t3._toQuantum(), i, E(a), n3);
    });
  }
  levelColors(e30, t3, n2) {
    this.levelColorsPrivate(false, e30, t3, n2);
  }
  linearStretch(e30, t3) {
    this.useExceptionPointer((n2) => {
      V._api._MagickImage_LinearStretch(this._instance, e30.toDouble(), t3._toQuantum(), n2);
    });
  }
  liquidRescale(e30, t3) {
    let n2 = typeof e30 == "number" ? new D(e30, t3) : e30;
    this.useException((e31) => {
      w(n2.toString(), (t4) => {
        let r2 = V._api._MagickImage_LiquidRescale(this._instance, t4, Number(n2.x), Number(n2.y), e31.ptr);
        this._setInstance(r2, e31);
      });
    });
  }
  negate(e30) {
    this.useExceptionPointer((t3) => {
      let n2 = this.valueOrDefault(e30, g.Undefined);
      V._api._MagickImage_Negate(this._instance, 0, E(n2), t3);
    });
  }
  negateGrayScale(e30) {
    this.useExceptionPointer((t3) => {
      let n2 = this.valueOrDefault(e30, g.Undefined);
      V._api._MagickImage_Negate(this._instance, 1, E(n2), t3);
    });
  }
  normalize() {
    this.useExceptionPointer((e30) => {
      V._api._MagickImage_Normalize(this._instance, e30);
    });
  }
  modulate(e30, t3, n2) {
    let r2 = this.valueOrDefault(t3, new L(100)), i = this.valueOrDefault(n2, new L(100));
    this.useExceptionPointer((t4) => {
      w(`${e30.toDouble()}/${r2.toDouble()}/${i.toDouble()}`, (e31) => {
        V._api._MagickImage_Modulate(this._instance, e31, t4);
      });
    });
  }
  morphology(e30) {
    this.useException((t3) => {
      w(e30.kernel, (n2) => {
        let r2 = V._api._MagickImage_Morphology(this._instance, E(e30.method), n2, E(e30.channels), E(e30.iterations), t3.ptr);
        this._setInstance(r2, t3);
      });
    });
  }
  motionBlur(e30, t3, n2) {
    this.useException((r2) => {
      let i = V._api._MagickImage_MotionBlur(this._instance, e30, t3, n2, r2.ptr);
      this._setInstance(i, r2);
    });
  }
  oilPaint(e30) {
    let t3 = this.valueOrDefault(e30, 3);
    this.useException((e31) => {
      let n2 = V._api._MagickImage_OilPaint(this._instance, t3, 0, e31.ptr);
      this._setInstance(n2, e31);
    });
  }
  opaque = (e30, t3) => this.opaquePrivate(e30, t3, false);
  ping(e30, t3) {
    this.readOrPing(true, e30, t3);
  }
  perceptualHash(e30) {
    let t3 = this.valueOrDefault(e30, We._defaultColorspaces());
    return We._validateColorSpaces(t3), Re.use(this, (e31) => {
      let n2 = t3.map((e32) => te[e32]).join(",");
      return e31.setArtifact("phash:colorspaces", n2), this.useExceptionPointer((e32) => {
        let n3 = V._api._MagickImage_PerceptualHash(this._instance, e32);
        try {
          return We._create(this, t3, n3);
        } finally {
          V._api._PerceptualHash_DisposeList(n3);
        }
      });
    });
  }
  quantize(e30) {
    let t3 = this.valueOrDefault(e30, new I());
    return this.useException((e31) => {
      t3._use((t4) => {
        V._api._MagickImage_Quantize(this._instance, t4._instance, e31.ptr);
      });
    }), t3.measureErrors ? ke._create(this) : null;
  }
  read(e30, t3, n2) {
    this.readOrPing(false, e30, t3, n2);
  }
  readFromCanvas(e30, t3) {
    let n2 = e30.getContext("2d", t3);
    if (n2 === null) return;
    let r2 = n2.getImageData(0, 0, e30.width, e30.height), i = new Fe();
    i.format = Ae.Rgba, i.width = e30.width, i.height = e30.height, this.useException((e31) => {
      this.readFromArray(r2.data, i, e31);
    });
  }
  removeArtifact(e30) {
    w(e30, (e31) => {
      V._api._MagickImage_RemoveArtifact(this._instance, e31);
    });
  }
  removeAttribute(e30) {
    w(e30, (e31) => {
      V._api._MagickImage_RemoveAttribute(this._instance, e31);
    });
  }
  removeProfile(e30) {
    w(typeof e30 == "string" ? e30 : e30.name, (e31) => {
      V._api._MagickImage_RemoveProfile(this._instance, e31);
    });
  }
  removeWriteMask() {
    this.useExceptionPointer((e30) => {
      V._api._MagickImage_SetWriteMask(this._instance, V._api._NullPointer, e30);
    });
  }
  resetPage() {
    this.page = new D(0, 0, 0, 0);
  }
  resize(e30, t3, n2) {
    let r2 = this.filterType, i;
    typeof e30 == "number" ? (i = new D(e30, t3), n2 !== void 0 && (r2 = n2)) : (i = e30, t3 !== void 0 && (r2 = t3)), this.useException((e31) => {
      w(i.toString(), (t4) => {
        let n3 = V._api._MagickImage_Resize(this._instance, t4, r2, e31.ptr);
        this._setInstance(n3, e31);
      });
    });
  }
  roll(e30, t3) {
    this.useException((n2) => {
      let r2 = V._api._MagickImage_Roll(this._instance, E(e30), E(t3), n2.ptr);
      this._setInstance(r2, n2);
    });
  }
  rotate(e30) {
    this.useException((t3) => {
      let n2 = V._api._MagickImage_Rotate(this._instance, e30, t3.ptr);
      this._setInstance(n2, t3);
    });
  }
  separate(e30, t3) {
    return this.useException((n2) => {
      let r2, i = g.Undefined;
      if (typeof e30 == "number" && t3 !== void 0) i = e30, r2 = t3;
      else if (typeof e30 == "function") r2 = e30;
      else throw new y("invalid arguments");
      let a = V._api._MagickImage_Separate(this._instance, E(i), n2.ptr);
      return ze._createFromImages(a, this._settings, (e31) => r2(e31));
    });
  }
  sepiaTone(e30 = new L(80)) {
    this.useException((t3) => {
      let n2 = typeof e30 == "number" ? new L(e30) : e30, r2 = V._api._MagickImage_SepiaTone(this._instance, n2._toQuantum(), t3.ptr);
      this._setInstance(r2, t3);
    });
  }
  setArtifact(e30, t3) {
    let n2;
    n2 = typeof t3 == "string" ? t3 : typeof t3 == "boolean" ? b(t3).toString() : t3.toString(), w(e30, (e31) => {
      w(n2, (t4) => {
        V._api._MagickImage_SetArtifact(this._instance, e31, t4);
      });
    });
  }
  setAttribute(e30, t3) {
    this.useException((n2) => {
      w(e30, (e31) => {
        w(t3, (t4) => {
          V._api._MagickImage_SetAttribute(this._instance, e31, t4, n2.ptr);
        });
      });
    });
  }
  setCompression(e30) {
    V._api._MagickImage_Compression_Set(this._instance, E(e30));
  }
  setProfile(e30, t3) {
    let n2 = typeof e30 == "string" ? e30 : e30.name, r2;
    t3 === void 0 ? typeof e30 != "string" && (r2 = e30.data) : r2 = t3, this.useException((e31) => {
      w(n2, (t4) => {
        Ce(r2, (n3) => {
          V._api._MagickImage_SetProfile(this._instance, t4, n3, E(r2.byteLength), e31.ptr);
        });
      });
    });
  }
  setWriteMask(e30) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_SetWriteMask(this._instance, e30._instance, t3);
    });
  }
  shadow(e30, t3, n2, r2, i) {
    let a, o = typeof e30 == "number" ? e30 : 5, s = this.valueOrDefault(t3, 5), c = this.valueOrDefault(n2, 0.5), l = this.valueOrDefault(r2, new L(80)), u = typeof e30 == "number" ? i : e30;
    u !== void 0 && (a = this.backgroundColor, this.backgroundColor = u);
    try {
      this.useException((e31) => {
        let t4 = V._api._MagickImage_Shadow(this._instance, E(o), E(s), c, l.toDouble(), e31.ptr);
        this._setInstance(t4, e31);
      });
    } finally {
      a !== void 0 && (this.backgroundColor = a);
    }
  }
  sharpen(e30, t3, n2) {
    let r2 = this.valueOrDefault(e30, 0), i = this.valueOrDefault(t3, 1), a = this.valueOrDefault(n2, g.Undefined);
    this.useException((e31) => {
      let t4 = V._api._MagickImage_Sharpen(this._instance, r2, i, E(a), e31.ptr);
      this._setInstance(t4, e31);
    });
  }
  shave(e30, t3) {
    this.useException((n2) => {
      let r2 = V._api._MagickImage_Shave(this._instance, E(e30), E(t3), n2.ptr);
      this._setInstance(r2, n2);
    });
  }
  sigmoidalContrast(e30, t3, n2) {
    this.sigmoidalContrastPrivate(true, e30, t3, n2);
  }
  solarize(e30 = new L(50)) {
    this.useException((t3) => {
      let n2 = typeof e30 == "number" ? new L(e30) : e30;
      V._api._MagickImage_Solarize(this._instance, n2._toQuantum(), t3.ptr);
    });
  }
  splice(e30, t3) {
    let n2 = this.valueOrDefault(t3, N.Undefined);
    w(e30.toString(), (e31) => {
      this.useException((t4) => {
        let r2 = V._api._MagickImage_Splice(this._instance, e31, E(n2), t4.ptr);
        this._setInstance(r2, t4);
      });
    });
  }
  statistics(e30) {
    let t3 = this.valueOrDefault(e30, g.All);
    return this.useExceptionPointer((e31) => {
      let n2 = V._api._MagickImage_Statistics(this._instance, E(t3), e31), r2 = Xe._create(this, n2, t3);
      return V._api._Statistics_DisposeList(n2), r2;
    });
  }
  strip() {
    this.useExceptionPointer((e30) => {
      V._api._MagickImage_Strip(this._instance, e30);
    });
  }
  transformColorSpace(e30, t3, n2) {
    let r2 = e30, i, a = oe.Quantum;
    t3 !== void 0 && (typeof t3 == "number" ? a = t3 : i = t3), n2 !== void 0 && (a = n2);
    let o = this.hasProfile("icc") || this.hasProfile("icm");
    if (i === void 0) {
      if (!o) return false;
      i = r2;
    } else {
      if (r2.colorSpace !== this.colorSpace) return false;
      o || this.setProfile(r2);
    }
    return a === oe.Quantum ? Re.use(this, (e31) => {
      e31.setArtifact("profile:highres-transform", false), this.setProfile(i);
    }) : this.setProfile(i), true;
  }
  threshold(e30, t3) {
    let n2 = this.valueOrDefault(t3, g.Undefined);
    this.useExceptionPointer((t4) => {
      V._api._MagickImage_Threshold(this._instance, e30._toQuantum(), E(n2), t4);
    });
  }
  thumbnail(e30, t3) {
    let n2 = typeof e30 == "number" ? new D(e30, t3) : e30;
    this.useException((e31) => {
      w(n2.toString(), (t4) => {
        let n3 = V._api._MagickImage_Thumbnail(this._instance, t4, e31.ptr);
        this._setInstance(n3, e31);
      });
    });
  }
  toString = () => `${this.format} ${this.width}x${this.height} ${this.depth}-bit ${te[this.colorSpace]}`;
  transparent(e30) {
    e30._use((e31) => {
      this.useExceptionPointer((t3) => {
        V._api._MagickImage_Transparent(this._instance, e31, 0, t3);
      });
    });
  }
  trim(...e30) {
    if (e30.length > 0) {
      if (e30.length == 1 && e30[0] instanceof L) {
        let t3 = e30[0];
        this.setArtifact("trim:percent-background", t3.toDouble().toString());
      } else {
        let t3 = [...new Set(De(e30))].join(",");
        this.setArtifact("trim:edges", t3);
      }
    }
    this.useException((e31) => {
      let t3 = V._api._MagickImage_Trim(this._instance, e31.ptr);
      this._setInstance(t3, e31), this.removeArtifact("trim:edges"), this.removeArtifact("trim:percent-background");
    });
  }
  wave(e30, t3, n2) {
    let r2 = this.valueOrDefault(e30, this.interpolate), i = this.valueOrDefault(t3, 25), a = this.valueOrDefault(n2, 150);
    this.useException((e31) => {
      let t4 = V._api._MagickImage_Wave(this._instance, E(r2), i, a, e31.ptr);
      this._setInstance(t4, e31);
    });
  }
  vignette(e30, t3, n2, r2) {
    let i = this.valueOrDefault(e30, 0), a = this.valueOrDefault(t3, 1), o = this.valueOrDefault(n2, 0), s = this.valueOrDefault(r2, 0);
    this.useException((e31) => {
      let t4 = V._api._MagickImage_Vignette(this._instance, i, a, E(o), E(s), e31.ptr);
      this._setInstance(t4, e31);
    });
  }
  whiteThreshold(e30, t3) {
    let n2 = this.valueOrDefault(t3, g.Composite);
    this.useException((t4) => {
      w(e30.toString(), (e31) => {
        V._api._MagickImage_WhiteThreshold(this._instance, e31, E(n2), t4.ptr);
      });
    });
  }
  write(e30, t3) {
    let n2 = V._api._NullPointer, r2 = 0;
    t3 === void 0 ? t3 = e30 : this._settings.format = e30, this.useException((e31) => {
      be.use((t4) => {
        this._settings._use((i2) => {
          try {
            n2 = V._api._MagickImage_WriteBlob(this._instance, i2._instance, t4.ptr, e31.ptr), r2 = Number(t4.value);
          } catch (e32) {
            throw n2 !== V._api._NullPointer && (n2 = V._api._MagickMemory_Relinquish(n2)), e32;
          }
        });
      });
    });
    let i = new ve(n2, r2, t3);
    return A._disposeAfterExecution(i, i.func);
  }
  writeToCanvas(e30, t3) {
    e30.width = this.width, e30.height = this.height;
    let n2 = e30.getContext("2d", t3);
    n2 !== null && Ge._map(this, "RGBA", (e31) => {
      let t4 = n2.createImageData(this.width, this.height), r2 = 0;
      for (let n3 = 0; n3 < this.height; n3++) for (let n4 = 0; n4 < this.width; n4++) t4.data[r2++] = V._api.HEAPU8[e31++], t4.data[r2++] = V._api.HEAPU8[e31++], t4.data[r2++] = V._api.HEAPU8[e31++], t4.data[r2++] = V._api.HEAPU8[e31++];
      n2.putImageData(t4, 0, 0);
    });
  }
  static _createFromImage(e30, n2) {
    return new t2(e30, n2);
  }
  _channelOffset(e30) {
    return V._api._MagickImage_HasChannel(this._instance, E(e30)) ? Number(V._api._MagickImage_ChannelOffset(this._instance, E(e30))) : -1;
  }
  static _clone(e30) {
    return j.usePointer((n2) => new t2(V._api._MagickImage_Clone(e30._instance, n2), e30._settings._clone()));
  }
  _getSettings() {
    return this._settings;
  }
  _instanceNotInitialized() {
    throw new y("no image has been read");
  }
  _setInstance(e30, t3) {
    if (super._setInstance(e30, t3) === true || e30 === V._api._NullPointer && this.onProgress !== void 0) return true;
    throw new y("out of memory");
  }
  _use(e30) {
    return A._disposeAfterExecution(this, e30);
  }
  static _create(e30) {
    return t2.create()._use(e30);
  }
  onDispose() {
    this.disposeProgressDelegate();
  }
  contrastPrivate(e30) {
    this.useExceptionPointer((t3) => {
      V._api._MagickImage_Contrast(this._instance, b(e30), t3);
    });
  }
  static createInstance() {
    return j.usePointer((e30) => V._api._MagickImage_Create(V._api._NullPointer, e30));
  }
  disposeProgressDelegate() {
    rt.removeProgressDelegate(this), this._progress = void 0;
  }
  floodFillPrivate(e30, n2, r2, i, a) {
    let o = i;
    o === void 0 && this.getPixels((e31) => {
      let t3 = e31.getColor(n2, r2);
      t3 !== null && (o = t3);
    }), typeof e30 == "number" && o !== void 0 && (o.a = e30), this.settings._drawing._use((i2) => {
      e30 instanceof T ? (i2.setFillColor(e30), i2.setFillPattern()) : e30 instanceof t2 && (i2.setFillColor(), i2.setFillPattern(e30)), this.useExceptionPointer((e31) => {
        o === void 0 ? V._api._MagickImage_FloodFill(this._instance, i2._instance, E(n2), E(r2), V._api._NullPointer, b(a), e31) : o._use((t3) => {
          V._api._MagickImage_FloodFill(this._instance, i2._instance, E(n2), E(r2), t3, b(a), e31);
        });
      });
    });
  }
  getProfilePrivate(e30) {
    return w(e30, (e31) => {
      let t3 = V._api._MagickImage_GetProfile(this._instance, e31), n2 = Ze.toArray(t3);
      return n2 === null ? null : n2;
    });
  }
  levelColorsPrivate(e30, t3, n2, r2) {
    let i = this.valueOrDefault(r2, g.RGB);
    this.useExceptionPointer((r3) => {
      t3._use((t4) => {
        n2._use((n3) => {
          V._api._MagickImage_LevelColors(this._instance, t4, n3, E(i), b(e30), r3);
        });
      });
    });
  }
  onSettingsArtifactChanged(e30, t3) {
    t3 === void 0 ? this.removeArtifact(e30) : this.setArtifact(e30, t3);
  }
  opaquePrivate(e30, t3, n2) {
    this.useExceptionPointer((r2) => {
      e30._use((e31) => {
        t3._use((t4) => {
          V._api._MagickImage_Opaque(this._instance, e31, t4, b(n2), r2);
        });
      });
    });
  }
  readOrPing(t3, n2, r2, i) {
    this.useException((a) => {
      let o = r2 instanceof Fe ? r2 : new Fe(this._settings);
      if (o._ping = t3, this._settings._ping = t3, o.frameCount !== void 0 && o.frameCount > 1) throw new y("The frame count can only be set to 1 when a single image is being read.");
      if (typeof n2 == "string") o._fileName = n2;
      else if (e(n2)) {
        this.readFromArray(n2, o, a);
        return;
      } else o._fileName = "xc:" + n2.toShortString(), o.width = typeof r2 == "number" ? r2 : 0, o.height = typeof i == "number" ? i : 0;
      o._use((e30) => {
        let t4 = V._api._MagickImage_ReadFile(e30._instance, a.ptr);
        this._setInstance(t4, a);
      });
    });
  }
  readFromArray(e30, t3, n2) {
    t3._use((t4) => {
      Ce(e30, (r2) => {
        let i = E(e30.byteLength), a = V._api._MagickImage_ReadBlob(t4._instance, r2, V._api._NullPointer, i, n2.ptr);
        this._setInstance(a, n2);
      });
    });
  }
  sigmoidalContrastPrivate(e30, t3, n2, r2) {
    let i;
    i = n2 === void 0 ? de.max * 0.5 : typeof n2 == "number" ? n2 : n2.multiply(de.max);
    let a = E(this.valueOrDefault(r2, g.Undefined));
    this.useExceptionPointer((n3) => {
      V._api._MagickImage_SigmoidalContrast(this._instance, b(e30), t3, i, a, n3);
    });
  }
  transparentPrivate(e30, t3) {
    e30._use((e31) => {
      this.useExceptionPointer((n2) => {
        V._api._MagickImage_Transparent(this._instance, e31, b(t3), n2);
      });
    });
  }
  valueOrDefault(e30, t3) {
    return e30 === void 0 ? t3 : e30;
  }
  valueOrComputedDefault(e30, t3) {
    return e30 === void 0 ? t3() : e30;
  }
  useException(e30) {
    return j.use(e30, (e31) => {
      this.onWarning !== void 0 && this.onWarning(new Qe(e31));
    });
  }
  useExceptionPointer(e30) {
    return j.usePointer(e30, (e31) => {
      this.onWarning !== void 0 && this.onWarning(new Qe(e31));
    });
  }
};
async function z(e30 = {}) {
  var t3 = e30, n2 = !!globalThis.window, r2 = !!globalThis.WorkerGlobalScope;
  globalThis.process?.versions?.node && globalThis.process?.type, (!globalThis.crypto || !globalThis.crypto.getRandomValues) && (globalThis.crypto = { getRandomValues: (e31) => {
    for (let t4 = 0; t4 < e31.length; t4++) e31[t4] = Math.random() * 256 | 0;
  } }), t3._CastToSize = (e31) => e31, t3._NullPointer = 0, t3._PointerSize = 4;
  var i = "./this.program", a = (e31, t4) => {
    throw t4;
  }, o = {}.url, s = "";
  function c(e31) {
    return t3.locateFile ? t3.locateFile(e31, s) : s + e31;
  }
  var l, u;
  if (n2 || r2) {
    try {
      s = new URL(".", o).href;
    } catch {
    }
    r2 && (u = (e31) => {
      var t4 = new XMLHttpRequest();
      return t4.open("GET", e31, false), t4.responseType = "arraybuffer", t4.send(null), new Uint8Array(t4.response);
    }), l = async (e31) => {
      if (h2(e31)) return new Promise((t5, n3) => {
        var r3 = new XMLHttpRequest();
        r3.open("GET", e31, true), r3.responseType = "arraybuffer", r3.onload = () => {
          r3.status == 200 || r3.status == 0 && r3.response ? t5(r3.response) : n3(r3.status);
        }, r3.onerror = n3, r3.send(null);
      });
      var t4 = await fetch(e31, { credentials: "same-origin" });
      if (t4.ok) return t4.arrayBuffer();
      throw Error(t4.status + " : " + t4.url);
    };
  }
  var d = console.log.bind(console), f = console.error.bind(console), p2, m2 = false, h2 = (e31) => e31.startsWith("file://");
  class g2 {
  }
  class ee2 extends g2 {
  }
  class _2 extends g2 {
    constructor(e31) {
      super(), this.excPtr = e31;
    }
  }
  function te2() {
    return ki.buffer;
  }
  function ne2() {
    if (!b2?.buffer?.resizable) {
      var e31 = te2();
      b2 = new Int8Array(e31), W2 = new Int16Array(e31), t3.HEAPU8 = F2 = new Uint8Array(e31), Y = new Uint16Array(e31), z2 = new Int32Array(e31), k2 = new Uint32Array(e31), Pn = new Float32Array(e31), Fn = new Float64Array(e31), B2 = new BigInt64Array(e31), Mt = new BigUint64Array(e31);
    }
  }
  function re2() {
    !t3.noFSInit && !R2.initialized && R2.init(), P2.init(), Sa.qb(), R2.ignorePermissions = false;
  }
  function v2(e31) {
    throw e31 = `Aborted(${e31})`, f(e31), m2 = true, e31 += ". Build with -sASSERTIONS for more info.", new WebAssembly.RuntimeError(e31);
  }
  var ie2;
  function ae2() {
    return t3.locateFile ? c("magick.wasm") : new URL("data:text/plain;base64,").href;
  }
  function oe2(e31) {
    if (e31 == ie2 && p2) return new Uint8Array(p2);
    if (u) return u(e31);
    throw "both async and sync fetching of the wasm failed";
  }
  async function se2(e31) {
    if (!p2) try {
      var t4 = await l(e31);
      return new Uint8Array(t4);
    } catch {
    }
    return oe2(e31);
  }
  async function ce2(e31, t4) {
    try {
      var n3 = await se2(e31);
      return await WebAssembly.instantiate(n3, t4);
    } catch (e32) {
      f(`failed to asynchronously prepare wasm: ${e32}`), v2(e32);
    }
  }
  async function le2(e31, t4, n3) {
    if (!e31 && !h2(t4)) try {
      var r3 = fetch(t4, { credentials: "same-origin" });
      return await WebAssembly.instantiateStreaming(r3, n3);
    } catch (e32) {
      f(`wasm streaming compile failed: ${e32}`), f("falling back to ArrayBuffer instantiation");
    }
    return ce2(t4, n3);
  }
  function ue2() {
    return { a: Mi };
  }
  async function y2() {
    function e31(e32) {
      return Sa = e32.exports, Sa = ba(Sa), ji(Sa), ne2(), Sa;
    }
    function n3(t4) {
      return e31(t4.instance);
    }
    var r3 = ue2(), i2 = t3.instantiateWasm;
    return i2 ? new Promise((t4) => {
      i2(r3, (n4) => t4(e31(n4)));
    }) : (ie2 ??= ae2(), n3(await le2(p2, ie2, r3)));
  }
  class de2 {
    name = "ExitStatus";
    constructor(e31) {
      this.message = `Program terminated with exit(${e31})`, this.status = e31;
    }
  }
  var b2, x2 = (e31) => Ci(e31), S2 = () => wi(), fe2 = 9007199254740992, pe2 = -9007199254740992, C2 = (e31) => e31 < pe2 || e31 > fe2 ? NaN : Number(e31), w2 = [], T2 = (e31) => {
    var t4 = w2[e31];
    return t4 || (w2[e31] = t4 = Ai.get(e31)), t4;
  };
  function me2(e31, t4) {
    return e31 >>>= 0, T2(e31)(t4);
  }
  var E2 = [], D2 = 0;
  function he2(e31) {
    e31 >>>= 0;
    var t4 = new _e2(e31);
    return t4.get_caught() || (t4.set_caught(true), D2--), t4.set_rethrown(false), E2.push(t4), Oi(e31);
  }
  var O2 = null, ge2 = () => {
    $(0, 0);
    var e31 = E2.pop();
    Ti(e31.excPtr), O2 = null;
  }, k2;
  class _e2 {
    constructor(e31) {
      this.excPtr = e31, this.ptr = e31 - 24;
    }
    set_type(e31) {
      k2[this.ptr + 4 >>> 2 >>> 0] = e31;
    }
    get_type() {
      return k2[this.ptr + 4 >>> 2 >>> 0];
    }
    set_destructor(e31) {
      k2[this.ptr + 8 >>> 2 >>> 0] = e31;
    }
    get_destructor() {
      return k2[this.ptr + 8 >>> 2 >>> 0];
    }
    set_caught(e31) {
      e31 = +!!e31, b2[this.ptr + 12 >>> 0] = e31;
    }
    get_caught() {
      return b2[this.ptr + 12 >>> 0] != 0;
    }
    set_rethrown(e31) {
      e31 = +!!e31, b2[this.ptr + 13 >>> 0] = e31;
    }
    get_rethrown() {
      return b2[this.ptr + 13 >>> 0] != 0;
    }
    init(e31, t4) {
      this.set_adjusted_ptr(0), this.set_type(e31), this.set_destructor(t4);
    }
    set_adjusted_ptr(e31) {
      k2[this.ptr + 16 >>> 2 >>> 0] = e31;
    }
    get_adjusted_ptr() {
      return k2[this.ptr + 16 >>> 2 >>> 0];
    }
  }
  var A2 = (e31) => Si(e31), ve2 = (e31) => {
    var t4 = O2?.excPtr;
    if (!t4) return A2(0), 0;
    var n3 = new _e2(t4);
    n3.set_adjusted_ptr(t4);
    var r3 = n3.get_type();
    if (!r3) return A2(0), t4;
    for (var i2 of e31) {
      if (!i2 || i2 === r3) break;
      var a2 = n3.ptr + 16;
      if (Di(i2, r3, a2)) return A2(i2), t4;
    }
    return A2(r3), t4;
  };
  function ye2() {
    return ve2([]);
  }
  function be2(e31) {
    return e31 >>>= 0, ve2([e31]);
  }
  function j2(e31, t4, n3) {
    return e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, ve2([
      e31,
      t4,
      n3
    ]);
  }
  var xe2 = () => {
    E2.length || v2("no exception to throw");
    var e31 = E2.at(-1), t4 = e31.excPtr;
    throw e31.set_rethrown(true), e31.set_caught(false), D2++, Ei(t4), O2 = new _2(t4), O2;
  };
  function Se2(e31, t4, n3) {
    throw e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, new _e2(e31).init(t4, n3), Ei(e31), O2 = new _2(e31), D2++, O2;
  }
  var Ce2 = () => D2;
  function we2(e31) {
    throw e31 >>>= 0, O2 ||= new _2(e31), O2;
  }
  var M2 = {
    isAbs: (e31) => e31.charAt(0) === "/",
    splitPath: (e31) => /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(e31).slice(1),
    normalizeArray: (e31, t4) => {
      for (var n3 = 0, r3 = e31.length - 1; r3 >= 0; r3--) {
        var i2 = e31[r3];
        i2 === "." ? e31.splice(r3, 1) : i2 === ".." ? (e31.splice(r3, 1), n3++) : n3 && (e31.splice(r3, 1), n3--);
      }
      if (t4) for (; n3; n3--) e31.unshift("..");
      return e31;
    },
    normalize: (e31) => {
      var t4 = M2.isAbs(e31), n3 = e31.slice(-1) === "/";
      return e31 = M2.normalizeArray(e31.split("/").filter((e32) => !!e32), !t4).join("/"), !e31 && !t4 && (e31 = "."), e31 && n3 && (e31 += "/"), (t4 ? "/" : "") + e31;
    },
    dirname: (e31) => {
      var t4 = M2.splitPath(e31), n3 = t4[0], r3 = t4[1];
      return !n3 && !r3 ? "." : (r3 &&= r3.slice(0, -1), n3 + r3);
    },
    basename: (e31) => e31 && e31.match(/([^\/]+|\/)\/*$/)[1],
    join: (...e31) => M2.normalize(e31.join("/")),
    join2: (e31, t4) => M2.normalize(e31 + "/" + t4)
  }, Te2 = () => (e31) => (crypto.getRandomValues(e31), 0), Ee2 = (e31) => (Ee2 = Te2())(e31), N2 = {
    resolve: (...e31) => {
      for (var t4 = "", n3 = false, r3 = e31.length - 1; r3 >= -1 && !n3; r3--) {
        var i2 = r3 >= 0 ? e31[r3] : R2.cwd();
        if (typeof i2 != "string") throw TypeError("Arguments to path.resolve must be strings");
        if (!i2) return "";
        t4 = i2 + "/" + t4, n3 = M2.isAbs(i2);
      }
      return t4 = M2.normalizeArray(t4.split("/").filter((e32) => !!e32), !n3).join("/"), (n3 ? "/" : "") + t4 || ".";
    },
    relative: (e31, t4) => {
      e31 = N2.resolve(e31).slice(1), t4 = N2.resolve(t4).slice(1);
      function n3(e32) {
        for (var t5 = 0; t5 < e32.length && e32[t5] === ""; t5++) ;
        for (var n4 = e32.length - 1; n4 >= 0 && e32[n4] === ""; n4--) ;
        return t5 > n4 ? [] : e32.slice(t5, n4 - t5 + 1);
      }
      for (var r3 = n3(e31.split("/")), i2 = n3(t4.split("/")), a2 = Math.min(r3.length, i2.length), o2 = a2, s2 = 0; s2 < a2; s2++) if (r3[s2] !== i2[s2]) {
        o2 = s2;
        break;
      }
      for (var c2 = [], s2 = o2; s2 < r3.length; s2++) c2.push("..");
      return c2 = c2.concat(i2.slice(o2)), c2.join("/");
    }
  }, De2 = globalThis.TextDecoder && new TextDecoder(), Oe2 = (e31, t4, n3, r3) => {
    var i2 = t4 + n3;
    if (r3) return i2;
    for (; e31[t4] && !(t4 >= i2); ) ++t4;
    return t4;
  }, ke2 = (e31, t4 = 0, n3, r3) => {
    t4 >>>= 0;
    var i2 = Oe2(e31, t4, n3, r3);
    if (i2 - t4 > 16 && e31.buffer && De2) return De2.decode(e31.subarray(t4, i2));
    for (var a2 = ""; t4 < i2; ) {
      var o2 = e31[t4++];
      if (!(o2 & 128)) a2 += String.fromCharCode(o2);
      else {
        var s2 = e31[t4++] & 63;
        if ((o2 & 224) == 192) a2 += String.fromCharCode((o2 & 31) << 6 | s2);
        else {
          var c2 = e31[t4++] & 63;
          if (o2 = (o2 & 240) == 224 ? (o2 & 15) << 12 | s2 << 6 | c2 : (o2 & 7) << 18 | s2 << 12 | c2 << 6 | e31[t4++] & 63, o2 < 65536) a2 += String.fromCharCode(o2);
          else {
            var l2 = o2 - 65536;
            a2 += String.fromCharCode(55296 | l2 >> 10, 56320 | l2 & 1023);
          }
        }
      }
    }
    return a2;
  }, Ae2 = [], je2 = (e31) => {
    for (var t4 = 0, n3 = 0; n3 < e31.length; ++n3) {
      var r3 = e31.charCodeAt(n3);
      r3 <= 127 ? t4++ : r3 <= 2047 ? t4 += 2 : r3 >= 55296 && r3 <= 57343 ? (t4 += 4, ++n3) : t4 += 3;
    }
    return t4;
  }, Me2 = (e31, t4, n3, r3) => {
    if (n3 >>>= 0, !(r3 > 0)) return 0;
    for (var i2 = n3, a2 = n3 + r3 - 1, o2 = 0; o2 < e31.length; ++o2) {
      var s2 = e31.codePointAt(o2);
      if (s2 <= 127) {
        if (n3 >= a2) break;
        t4[n3++ >>> 0] = s2;
      } else if (s2 <= 2047) {
        if (n3 + 1 >= a2) break;
        t4[n3++ >>> 0] = 192 | s2 >> 6, t4[n3++ >>> 0] = 128 | s2 & 63;
      } else if (s2 <= 65535) {
        if (n3 + 2 >= a2) break;
        t4[n3++ >>> 0] = 224 | s2 >> 12, t4[n3++ >>> 0] = 128 | s2 >> 6 & 63, t4[n3++ >>> 0] = 128 | s2 & 63;
      } else {
        if (n3 + 3 >= a2) break;
        t4[n3++ >>> 0] = 240 | s2 >> 18, t4[n3++ >>> 0] = 128 | s2 >> 12 & 63, t4[n3++ >>> 0] = 128 | s2 >> 6 & 63, t4[n3++ >>> 0] = 128 | s2 & 63, o2++;
      }
    }
    return t4[n3 >>> 0] = 0, n3 - i2;
  }, Ne2 = (e31, t4, n3) => {
    var r3 = n3 > 0 ? n3 : je2(e31) + 1, i2 = Array(r3), a2 = Me2(e31, i2, 0, i2.length);
    return t4 && (i2.length = a2), i2;
  }, Pe2 = () => {
    if (!Ae2.length) {
      var e31 = null;
      if (globalThis.window?.prompt && (e31 = window.prompt("Input: "), e31 !== null && (e31 += "\n")), !e31) return null;
      Ae2 = Ne2(e31, true);
    }
    return Ae2.shift();
  }, P2 = {
    ttys: [],
    init() {
    },
    shutdown() {
    },
    register(e31, t4) {
      P2.ttys[e31] = {
        input: [],
        output: [],
        ops: t4
      }, R2.registerDevice(e31, P2.stream_ops);
    },
    stream_ops: {
      open(e31) {
        var t4 = P2.ttys[e31.node.rdev];
        if (!t4) throw new R2.ErrnoError(43);
        e31.tty = t4, e31.seekable = false;
      },
      close(e31) {
        e31.tty.ops.fsync(e31.tty);
      },
      fsync(e31) {
        e31.tty.ops.fsync(e31.tty);
      },
      read(e31, t4, n3, r3, i2) {
        if (!e31.tty || !e31.tty.ops.get_char) throw new R2.ErrnoError(60);
        for (var a2 = 0, o2 = 0; o2 < r3; o2++) {
          var s2;
          try {
            s2 = e31.tty.ops.get_char(e31.tty);
          } catch {
            throw new R2.ErrnoError(29);
          }
          if (s2 === void 0 && !a2) throw new R2.ErrnoError(6);
          if (s2 == null) break;
          a2++, t4[n3 + o2] = s2;
        }
        return a2 && (e31.node.atime = Date.now()), a2;
      },
      write(e31, t4, n3, r3, i2) {
        if (!e31.tty || !e31.tty.ops.put_char) throw new R2.ErrnoError(60);
        try {
          for (var a2 = 0; a2 < r3; a2++) e31.tty.ops.put_char(e31.tty, t4[n3 + a2]);
        } catch {
          throw new R2.ErrnoError(29);
        }
        return r3 && (e31.node.mtime = e31.node.ctime = Date.now()), a2;
      }
    },
    default_tty_ops: {
      get_char(e31) {
        return Pe2();
      },
      put_char(e31, t4) {
        t4 === null || t4 === 10 ? (d(ke2(e31.output)), e31.output = []) : t4 != 0 && e31.output.push(t4);
      },
      fsync(e31) {
        e31.output?.length > 0 && (d(ke2(e31.output)), e31.output = []);
      },
      ioctl_tcgets(e31) {
        return {
          c_iflag: 25856,
          c_oflag: 5,
          c_cflag: 191,
          c_lflag: 35387,
          c_cc: [
            3,
            28,
            127,
            21,
            4,
            0,
            1,
            0,
            17,
            19,
            26,
            0,
            18,
            15,
            23,
            22,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ]
        };
      },
      ioctl_tcsets(e31, t4, n3) {
        return 0;
      },
      ioctl_tiocgwinsz(e31) {
        return [24, 80];
      }
    },
    default_tty1_ops: {
      put_char(e31, t4) {
        t4 === null || t4 === 10 ? (f(ke2(e31.output)), e31.output = []) : t4 != 0 && e31.output.push(t4);
      },
      fsync(e31) {
        e31.output?.length > 0 && (f(ke2(e31.output)), e31.output = []);
      }
    }
  }, F2, Fe2 = (e31, t4) => F2.fill(0, e31, e31 + t4), Ie2 = (e31, t4) => Math.ceil(e31 / t4) * t4, Le2 = (e31) => {
    e31 = Ie2(e31, 65536);
    var t4 = xi(65536, e31);
    return t4 && Fe2(t4, e31), t4;
  }, I2 = {
    ops_table: null,
    mount(e31) {
      return I2.createNode(null, "/", 16895, 0);
    },
    createNode(e31, t4, n3, r3) {
      if (R2.isBlkdev(n3) || R2.isFIFO(n3)) throw new R2.ErrnoError(63);
      I2.ops_table ||= {
        dir: {
          node: {
            getattr: I2.node_ops.getattr,
            setattr: I2.node_ops.setattr,
            lookup: I2.node_ops.lookup,
            mknod: I2.node_ops.mknod,
            rename: I2.node_ops.rename,
            unlink: I2.node_ops.unlink,
            rmdir: I2.node_ops.rmdir,
            readdir: I2.node_ops.readdir,
            symlink: I2.node_ops.symlink
          },
          stream: { llseek: I2.stream_ops.llseek }
        },
        file: {
          node: {
            getattr: I2.node_ops.getattr,
            setattr: I2.node_ops.setattr
          },
          stream: {
            llseek: I2.stream_ops.llseek,
            read: I2.stream_ops.read,
            write: I2.stream_ops.write,
            mmap: I2.stream_ops.mmap,
            msync: I2.stream_ops.msync
          }
        },
        link: {
          node: {
            getattr: I2.node_ops.getattr,
            setattr: I2.node_ops.setattr,
            readlink: I2.node_ops.readlink
          },
          stream: {}
        },
        chrdev: {
          node: {
            getattr: I2.node_ops.getattr,
            setattr: I2.node_ops.setattr
          },
          stream: R2.chrdev_stream_ops
        }
      };
      var i2 = R2.createNode(e31, t4, n3, r3);
      return R2.isDir(i2.mode) ? (i2.node_ops = I2.ops_table.dir.node, i2.stream_ops = I2.ops_table.dir.stream, i2.contents = {}) : R2.isFile(i2.mode) ? (i2.node_ops = I2.ops_table.file.node, i2.stream_ops = I2.ops_table.file.stream, i2.usedBytes = 0, i2.contents = I2.emptyFileContents ??= /* @__PURE__ */ new Uint8Array()) : R2.isLink(i2.mode) ? (i2.node_ops = I2.ops_table.link.node, i2.stream_ops = I2.ops_table.link.stream) : R2.isChrdev(i2.mode) && (i2.node_ops = I2.ops_table.chrdev.node, i2.stream_ops = I2.ops_table.chrdev.stream), i2.atime = i2.mtime = i2.ctime = Date.now(), e31 && (e31.contents[t4] = i2, e31.atime = e31.mtime = e31.ctime = i2.atime), i2;
    },
    getFileDataAsTypedArray(e31) {
      return e31.contents.subarray(0, e31.usedBytes);
    },
    expandFileStorage(e31, t4) {
      var n3 = e31.contents.length;
      if (!(n3 >= t4)) {
        t4 = Math.max(t4, n3 * (n3 < 1048576 ? 2 : 1.125) >>> 0), n3 && (t4 = Math.max(t4, 256));
        var r3 = I2.getFileDataAsTypedArray(e31);
        e31.contents = new Uint8Array(t4), e31.contents.set(r3);
      }
    },
    resizeFileStorage(e31, t4) {
      if (e31.usedBytes != t4) {
        var n3 = e31.contents;
        e31.contents = new Uint8Array(t4), e31.contents.set(n3.subarray(0, Math.min(t4, e31.usedBytes))), e31.usedBytes = t4;
      }
    },
    node_ops: {
      getattr(e31) {
        var t4 = {};
        return t4.dev = R2.isChrdev(e31.mode) ? e31.id : 1, t4.ino = e31.id, t4.mode = e31.mode, t4.nlink = 1, t4.uid = 0, t4.gid = 0, t4.rdev = e31.rdev, t4.size = R2.isDir(e31.mode) ? 4096 : R2.isFile(e31.mode) ? e31.usedBytes : R2.isLink(e31.mode) ? e31.link.length : 0, t4.atime = new Date(e31.atime), t4.mtime = new Date(e31.mtime), t4.ctime = new Date(e31.ctime), t4.blksize = 4096, t4.blocks = Math.ceil(t4.size / t4.blksize), t4;
      },
      setattr(e31, t4) {
        for (let n3 of [
          "mode",
          "atime",
          "mtime",
          "ctime"
        ]) t4[n3] != null && (e31[n3] = t4[n3]);
        t4.size !== void 0 && I2.resizeFileStorage(e31, t4.size);
      },
      lookup(e31, t4) {
        throw I2.doesNotExistError || (I2.doesNotExistError = new R2.ErrnoError(44), I2.doesNotExistError.stack = "<generic error, no stack>"), I2.doesNotExistError;
      },
      mknod(e31, t4, n3, r3) {
        return I2.createNode(e31, t4, n3, r3);
      },
      rename(e31, t4, n3) {
        var r3;
        try {
          r3 = R2.lookupNode(t4, n3);
        } catch {
        }
        if (r3) {
          if (R2.isDir(e31.mode)) for (var i2 in r3.contents) throw new R2.ErrnoError(55);
          R2.hashRemoveNode(r3);
        }
        delete e31.parent.contents[e31.name], t4.contents[n3] = e31, e31.name = n3, t4.ctime = t4.mtime = e31.parent.ctime = e31.parent.mtime = Date.now();
      },
      unlink(e31, t4) {
        delete e31.contents[t4], e31.ctime = e31.mtime = Date.now();
      },
      rmdir(e31, t4) {
        for (var n3 in R2.lookupNode(e31, t4).contents) throw new R2.ErrnoError(55);
        delete e31.contents[t4], e31.ctime = e31.mtime = Date.now();
      },
      readdir(e31) {
        return [
          ".",
          "..",
          ...Object.keys(e31.contents)
        ];
      },
      symlink(e31, t4, n3) {
        var r3 = I2.createNode(e31, t4, 41471, 0);
        return r3.link = n3, r3;
      },
      readlink(e31) {
        if (!R2.isLink(e31.mode)) throw new R2.ErrnoError(28);
        return e31.link;
      }
    },
    stream_ops: {
      read(e31, t4, n3, r3, i2) {
        var a2 = e31.node.contents;
        if (i2 >= e31.node.usedBytes) return 0;
        var o2 = Math.min(e31.node.usedBytes - i2, r3);
        return t4.set(a2.subarray(i2, i2 + o2), n3), o2;
      },
      write(e31, t4, n3, r3, i2, a2) {
        if (t4.buffer === b2.buffer && (a2 = false), !r3) return 0;
        var o2 = e31.node;
        return o2.mtime = o2.ctime = Date.now(), a2 ? (o2.contents = t4.subarray(n3, n3 + r3), o2.usedBytes = r3) : !o2.usedBytes && !i2 ? (o2.contents = t4.slice(n3, n3 + r3), o2.usedBytes = r3) : (I2.expandFileStorage(o2, i2 + r3), o2.contents.set(t4.subarray(n3, n3 + r3), i2), o2.usedBytes = Math.max(o2.usedBytes, i2 + r3)), r3;
      },
      llseek(e31, t4, n3) {
        var r3 = t4;
        if (n3 === 1 ? r3 += e31.position : n3 === 2 && R2.isFile(e31.node.mode) && (r3 += e31.node.usedBytes), r3 < 0) throw new R2.ErrnoError(28);
        return r3;
      },
      mmap(e31, t4, n3, r3, i2) {
        if (!R2.isFile(e31.node.mode)) throw new R2.ErrnoError(43);
        var a2, o2, s2 = e31.node.contents;
        if (!(i2 & 2) && s2.buffer === b2.buffer) o2 = false, a2 = s2.byteOffset;
        else {
          if (o2 = true, a2 = Le2(t4), !a2) throw new R2.ErrnoError(48);
          s2 && ((n3 > 0 || n3 + t4 < s2.length) && (s2 = s2.subarray ? s2.subarray(n3, n3 + t4) : Array.prototype.slice.call(s2, n3, n3 + t4)), b2.set(s2, a2 >>> 0));
        }
        return {
          ptr: a2,
          allocated: o2
        };
      },
      msync(e31, t4, n3, r3, i2) {
        return I2.stream_ops.write(e31, t4, 0, r3, n3, false), 0;
      }
    }
  }, Re2 = (e31) => {
    if (typeof e31 != "string") return e31;
    var t4 = {
      r: 0,
      "r+": 2,
      w: 577,
      "w+": 578,
      a: 1089,
      "a+": 1090
    }[e31];
    if (t4 === void 0) throw Error(`Unknown file open mode: ${e31}`);
    return t4;
  }, ze2 = (e31) => (typeof e31 == "string" && (e31 = Ne2(e31, true)), e31.subarray || (e31 = new Uint8Array(e31)), e31), L2 = (e31, t4) => {
    var n3 = 0;
    return e31 && (n3 |= 365), t4 && (n3 |= 146), n3;
  }, Be2 = async (e31) => {
    var t4 = await l(e31);
    return new Uint8Array(t4);
  }, Ve2 = (...e31) => R2.createDataFile(...e31), He2 = (e31) => e31, Ue2 = null, We2 = async () => Ue2, Ge2 = 0, Ke2 = null, qe2 = (e31) => {
    Ge2--, Ge2 || Ke2();
  }, Je2 = (e31) => {
    Ge2 || (Ue2 = new Promise((e32) => Ke2 = e32)), Ge2++;
  }, Ye2 = [], Xe2 = async (e31, t4) => {
    typeof Browser < "u" && Browser.init();
    for (var n3 of Ye2) if (n3.canHandle(t4)) return n3.handle(e31, t4);
    return e31;
  }, Ze2 = async (e31, t4, n3, r3, i2, a2, o2, s2) => {
    var c2 = t4 ? N2.resolve(M2.join2(e31, t4)) : e31, l2 = He2(`cp ${c2}`);
    Je2(l2);
    try {
      var u2 = n3;
      typeof n3 == "string" && (u2 = await Be2(n3)), u2 = await Xe2(u2, c2), s2?.(), a2 || Ve2(e31, t4, u2, r3, i2, o2);
    } finally {
      qe2(l2);
    }
  }, Qe2 = (e31, t4, n3, r3, i2, a2, o2, s2, c2, l2) => {
    Ze2(e31, t4, n3, r3, i2, s2, c2, l2).then(a2).catch(o2);
  }, R2 = {
    root: null,
    mounts: [],
    devices: {},
    streams: [],
    nextInode: 1,
    nameTable: null,
    currentPath: "/",
    initialized: false,
    ignorePermissions: true,
    filesystems: null,
    syncFSRequests: 0,
    ErrnoError: class {
      name = "ErrnoError";
      constructor(e31) {
        this.errno = e31;
      }
    },
    FSStream: class {
      shared = {};
      get object() {
        return this.node;
      }
      set object(e31) {
        this.node = e31;
      }
      get isRead() {
        return (this.flags & 2097155) != 1;
      }
      get isWrite() {
        return !!(this.flags & 2097155);
      }
      get isAppend() {
        return this.flags & 1024;
      }
      get flags() {
        return this.shared.flags;
      }
      set flags(e31) {
        this.shared.flags = e31;
      }
      get position() {
        return this.shared.position;
      }
      set position(e31) {
        this.shared.position = e31;
      }
    },
    FSNode: class {
      node_ops = {};
      stream_ops = {};
      readMode = 365;
      writeMode = 146;
      mounted = null;
      constructor(e31, t4, n3, r3) {
        e31 ||= this, this.parent = e31, this.mount = e31.mount, this.id = R2.nextInode++, this.name = t4, this.mode = n3, this.rdev = r3, this.atime = this.mtime = this.ctime = Date.now();
      }
      get read() {
        return (this.mode & this.readMode) === this.readMode;
      }
      set read(e31) {
        e31 ? this.mode |= this.readMode : this.mode &= ~this.readMode;
      }
      get write() {
        return (this.mode & this.writeMode) === this.writeMode;
      }
      set write(e31) {
        e31 ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
      }
      get isFolder() {
        return R2.isDir(this.mode);
      }
      get isDevice() {
        return R2.isChrdev(this.mode);
      }
      addListener(e31, t4 = false) {
        var n3 = {
          cb: e31,
          exclusive: t4
        }, r3 = this.listeners ??= /* @__PURE__ */ new Set();
        return r3.add(n3), {
          listeners: r3,
          entry: n3
        };
      }
      notifyListeners(e31) {
        if (this.listeners) {
          var t4;
          for (var n3 of this.listeners) n3.exclusive ? (t4 ||= []).push(n3) : n3.cb(e31);
          if (t4) {
            var r3 = (this.exclTurn || 0) % t4.length;
            this.exclTurn = r3 + 1, t4[r3].cb(e31);
          }
        }
      }
    },
    lookupPath(e31, t4 = {}) {
      if (!e31) throw new R2.ErrnoError(44);
      t4.follow_mount ??= true, M2.isAbs(e31) || (e31 = R2.cwd() + "/" + e31);
      linkloop: for (var n3 = 0; n3 < 40; n3++) {
        for (var r3 = e31.split("/").filter((e32) => !!e32), i2 = R2.root, a2 = "/", o2 = 0; o2 < r3.length; o2++) {
          var s2 = o2 === r3.length - 1;
          if (s2 && t4.parent) break;
          if (r3[o2] !== ".") {
            if (r3[o2] === "..") {
              if (a2 = M2.dirname(a2), R2.isRoot(i2)) {
                e31 = a2 + "/" + r3.slice(o2 + 1).join("/"), n3--;
                continue linkloop;
              }
              i2 = i2.parent;
            } else {
              a2 = M2.join2(a2, r3[o2]);
              try {
                i2 = R2.lookupNode(i2, r3[o2]);
              } catch (e32) {
                if (e32?.errno === 44 && s2 && t4.noent_okay) return { path: a2 };
                throw e32;
              }
              if (R2.isMountpoint(i2) && (!s2 || t4.follow_mount) && (i2 = i2.mounted.root), R2.isLink(i2.mode) && (!s2 || t4.follow)) {
                if (!i2.node_ops.readlink) throw new R2.ErrnoError(52);
                var c2 = i2.node_ops.readlink(i2);
                M2.isAbs(c2) || (c2 = M2.dirname(a2) + "/" + c2), e31 = c2 + "/" + r3.slice(o2 + 1).join("/");
                continue linkloop;
              }
            }
          }
        }
        return {
          path: a2,
          node: i2
        };
      }
      throw new R2.ErrnoError(32);
    },
    getPath(e31) {
      for (var t4; ; ) {
        if (R2.isRoot(e31)) {
          var n3 = e31.mount.mountpoint;
          return t4 ? n3[n3.length - 1] === "/" ? n3 + t4 : `${n3}/${t4}` : n3;
        }
        t4 = t4 ? `${e31.name}/${t4}` : e31.name, e31 = e31.parent;
      }
    },
    hashName(e31, t4) {
      for (var n3 = 0, r3 = 0; r3 < t4.length; r3++) n3 = (n3 << 5) - n3 + t4.charCodeAt(r3) | 0;
      return (e31 + n3 >>> 0) % R2.nameTable.length;
    },
    hashAddNode(e31) {
      var t4 = R2.hashName(e31.parent.id, e31.name);
      e31.name_next = R2.nameTable[t4], R2.nameTable[t4] = e31;
    },
    hashRemoveNode(e31) {
      var t4 = R2.hashName(e31.parent.id, e31.name);
      if (R2.nameTable[t4] === e31) R2.nameTable[t4] = e31.name_next;
      else for (var n3 = R2.nameTable[t4]; n3; ) {
        if (n3.name_next === e31) {
          n3.name_next = e31.name_next;
          break;
        }
        n3 = n3.name_next;
      }
    },
    lookupNode(e31, t4) {
      var n3 = R2.mayLookup(e31);
      if (n3) throw new R2.ErrnoError(n3);
      for (var r3 = R2.hashName(e31.id, t4), i2 = R2.nameTable[r3]; i2; i2 = i2.name_next) {
        var a2 = i2.name;
        if (i2.parent.id === e31.id && a2 === t4) return i2;
      }
      return R2.lookup(e31, t4);
    },
    createNode(e31, t4, n3, r3) {
      var i2 = new R2.FSNode(e31, t4, n3, r3);
      return R2.hashAddNode(i2), i2;
    },
    destroyNode(e31) {
      R2.hashRemoveNode(e31);
    },
    isRoot(e31) {
      return e31 === e31.parent;
    },
    isMountpoint(e31) {
      return !!e31.mounted;
    },
    isFile(e31) {
      return (e31 & 61440) == 32768;
    },
    isDir(e31) {
      return (e31 & 61440) == 16384;
    },
    isLink(e31) {
      return (e31 & 61440) == 40960;
    },
    isChrdev(e31) {
      return (e31 & 61440) == 8192;
    },
    isBlkdev(e31) {
      return (e31 & 61440) == 24576;
    },
    isFIFO(e31) {
      return (e31 & 61440) == 4096;
    },
    isSocket(e31) {
      return (e31 & 49152) == 49152;
    },
    flagsToPermissionString(e31) {
      var t4 = [
        "r",
        "w",
        "rw"
      ][e31 & 3];
      return e31 & 512 && (t4 += "w"), t4;
    },
    nodePermissions(e31, t4) {
      return R2.ignorePermissions ? 0 : t4.includes("r") && !(e31.mode & 292) || t4.includes("w") && !(e31.mode & 146) || t4.includes("x") && !(e31.mode & 73) ? 2 : 0;
    },
    mayLookup(e31) {
      return R2.isDir(e31.mode) ? R2.nodePermissions(e31, "x") || (e31.node_ops.lookup ? 0 : 2) : 54;
    },
    mayCreate(e31, t4) {
      if (!R2.isDir(e31.mode)) return 54;
      try {
        return R2.lookupNode(e31, t4), 20;
      } catch {
      }
      return R2.nodePermissions(e31, "wx");
    },
    mayDelete(e31, t4, n3) {
      var r3;
      try {
        r3 = R2.lookupNode(e31, t4);
      } catch (e32) {
        return e32.errno;
      }
      var i2 = R2.nodePermissions(e31, "wx");
      if (i2) return i2;
      if (n3) {
        if (!R2.isDir(r3.mode)) return 54;
        if (R2.isRoot(r3) || R2.getPath(r3) === R2.cwd()) return 10;
      } else if (R2.isDir(r3.mode)) return 31;
      return 0;
    },
    mayOpen(e31, t4) {
      if (!e31) return 44;
      if (R2.isLink(e31.mode)) return 32;
      var n3 = R2.flagsToPermissionString(t4);
      return R2.isDir(e31.mode) && (n3 !== "r" || t4 & 576) ? 31 : R2.nodePermissions(e31, n3);
    },
    checkOpExists(e31, t4) {
      if (!e31) throw new R2.ErrnoError(t4);
      return e31;
    },
    MAX_OPEN_FDS: 4096,
    nextfd() {
      for (var e31 = 0; e31 <= R2.MAX_OPEN_FDS; e31++) if (!R2.streams[e31]) return e31;
      throw new R2.ErrnoError(33);
    },
    getStreamChecked(e31) {
      var t4 = R2.getStream(e31);
      if (!t4) throw new R2.ErrnoError(8);
      return t4;
    },
    getStream: (e31) => R2.streams[e31],
    createStream(e31, t4 = -1) {
      return e31 = Object.assign(new R2.FSStream(), e31), t4 == -1 && (t4 = R2.nextfd()), e31.fd = t4, R2.streams[t4] = e31, e31;
    },
    closeStream(e31) {
      R2.streams[e31] = null;
    },
    dupStream(e31, t4 = -1) {
      var n3 = R2.createStream(e31, t4);
      return n3.stream_ops?.dup?.(n3), n3;
    },
    doSetAttr(e31, t4, n3) {
      var r3 = e31?.stream_ops.setattr, i2 = r3 ? e31 : t4;
      r3 ??= t4.node_ops.setattr, R2.checkOpExists(r3, 63);
      try {
        r3(i2, n3);
      } catch (e32) {
        throw e32 instanceof RangeError ? new R2.ErrnoError(22) : e32;
      }
    },
    chrdev_stream_ops: {
      open(e31) {
        e31.stream_ops = R2.getDevice(e31.node.rdev).stream_ops, e31.stream_ops.open?.(e31);
      },
      llseek() {
        throw new R2.ErrnoError(70);
      }
    },
    major: (e31) => e31 >> 8,
    minor: (e31) => e31 & 255,
    makedev: (e31, t4) => e31 << 8 | t4,
    registerDevice(e31, t4) {
      R2.devices[e31] = { stream_ops: t4 };
    },
    getDevice: (e31) => R2.devices[e31],
    getMounts(e31) {
      for (var t4 = [], n3 = [e31]; n3.length; ) {
        var r3 = n3.pop();
        t4.push(r3), n3.push(...r3.mounts);
      }
      return t4;
    },
    syncfs(e31, t4) {
      typeof e31 == "function" && (t4 = e31, e31 = false), R2.syncFSRequests++, R2.syncFSRequests > 1 && f(`warning: ${R2.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
      var n3 = R2.getMounts(R2.root.mount), r3 = 0;
      function i2(e32) {
        return R2.syncFSRequests--, t4(e32);
      }
      function a2(e32) {
        if (e32) return a2.errored ? void 0 : (a2.errored = true, i2(e32));
        ++r3 >= n3.length && i2(null);
      }
      for (var o2 of n3) o2.type.syncfs ? o2.type.syncfs(o2, e31, a2) : a2(null);
    },
    mount(e31, t4, n3) {
      var r3 = n3 === "/", i2 = !n3, a2;
      if (r3 && R2.root) throw new R2.ErrnoError(10);
      if (!r3 && !i2) {
        var o2 = R2.lookupPath(n3, { follow_mount: false });
        if (n3 = o2.path, a2 = o2.node, R2.isMountpoint(a2)) throw new R2.ErrnoError(10);
        if (!R2.isDir(a2.mode)) throw new R2.ErrnoError(54);
      }
      var s2 = {
        type: e31,
        opts: t4,
        mountpoint: n3,
        mounts: []
      }, c2 = e31.mount(s2);
      return c2.mount = s2, s2.root = c2, r3 ? R2.root = c2 : a2 && (a2.mounted = s2, a2.mount && a2.mount.mounts.push(s2)), c2;
    },
    unmount(e31) {
      var t4 = R2.lookupPath(e31, { follow_mount: false });
      if (!R2.isMountpoint(t4.node)) throw new R2.ErrnoError(28);
      var n3 = t4.node, r3 = n3.mounted, i2 = R2.getMounts(r3);
      for (var [a2, o2] of Object.entries(R2.nameTable)) for (; o2; ) {
        var s2 = o2.name_next;
        i2.includes(o2.mount) && R2.destroyNode(o2), o2 = s2;
      }
      n3.mounted = null;
      var c2 = n3.mount.mounts.indexOf(r3);
      n3.mount.mounts.splice(c2, 1);
    },
    lookup(e31, t4) {
      return e31.node_ops.lookup(e31, t4);
    },
    mknod(e31, t4, n3) {
      var r3 = R2.lookupPath(e31, { parent: true }).node, i2 = M2.basename(e31);
      if (!i2) throw new R2.ErrnoError(28);
      if (i2 === "." || i2 === "..") throw new R2.ErrnoError(20);
      var a2 = R2.mayCreate(r3, i2);
      if (a2) throw new R2.ErrnoError(a2);
      if (!r3.node_ops.mknod) throw new R2.ErrnoError(63);
      return r3.node_ops.mknod(r3, i2, t4, n3);
    },
    statfs(e31) {
      return R2.statfsNode(R2.lookupPath(e31, { follow: true }).node);
    },
    statfsStream(e31) {
      return R2.statfsNode(e31.node);
    },
    statfsNode(e31) {
      var t4 = {
        bsize: 4096,
        frsize: 4096,
        blocks: 1e6,
        bfree: 5e5,
        bavail: 5e5,
        files: R2.nextInode,
        ffree: R2.nextInode - 1,
        fsid: 42,
        flags: 2,
        namelen: 255
      };
      return e31.node_ops.statfs && Object.assign(t4, e31.node_ops.statfs(e31.mount.opts.root)), t4;
    },
    create(e31, t4 = 438) {
      return t4 &= 4095, t4 |= 32768, R2.mknod(e31, t4, 0);
    },
    mkdir(e31, t4 = 511) {
      return t4 &= 1023, t4 |= 16384, R2.mknod(e31, t4, 0);
    },
    mkdirTree(e31, t4) {
      var n3 = e31.split("/"), r3 = "";
      for (var i2 of n3) if (i2) {
        (r3 || M2.isAbs(e31)) && (r3 += "/"), r3 += i2;
        try {
          R2.mkdir(r3, t4);
        } catch (e32) {
          if (e32.errno != 20) throw e32;
        }
      }
    },
    mkdev(e31, t4, n3) {
      return n3 === void 0 && (n3 = t4, t4 = 438), t4 |= 8192, R2.mknod(e31, t4, n3);
    },
    symlink(e31, t4) {
      if (!N2.resolve(e31)) throw new R2.ErrnoError(44);
      var n3 = R2.lookupPath(t4, { parent: true }).node;
      if (!n3) throw new R2.ErrnoError(44);
      var r3 = M2.basename(t4), i2 = R2.mayCreate(n3, r3);
      if (i2) throw new R2.ErrnoError(i2);
      if (!n3.node_ops.symlink) throw new R2.ErrnoError(63);
      return n3.node_ops.symlink(n3, r3, e31);
    },
    link(e31, t4, n3) {
      var r3 = R2.lookupPath(t4, { parent: true }).node;
      if (!r3) throw new R2.ErrnoError(44);
      var i2 = M2.basename(t4), a2 = R2.mayCreate(r3, i2);
      if (a2) throw new R2.ErrnoError(a2);
      if (!r3.node_ops.link) throw new R2.ErrnoError(34);
      return r3.node_ops.link(r3, i2, e31, n3);
    },
    rename(e31, t4) {
      var n3 = M2.dirname(e31), r3 = M2.dirname(t4), i2 = M2.basename(e31), a2 = M2.basename(t4), o2 = R2.lookupPath(e31, { parent: true }), s2 = o2.node, c2;
      if (o2 = R2.lookupPath(t4, { parent: true }), c2 = o2.node, !s2 || !c2) throw new R2.ErrnoError(44);
      if (s2.mount !== c2.mount) throw new R2.ErrnoError(75);
      var l2 = R2.lookupNode(s2, i2), u2 = N2.relative(e31, r3);
      if (u2.charAt(0) !== ".") throw new R2.ErrnoError(28);
      if (u2 = N2.relative(t4, n3), u2.charAt(0) !== ".") throw new R2.ErrnoError(55);
      var d2;
      try {
        d2 = R2.lookupNode(c2, a2);
      } catch {
      }
      if (l2 !== d2) {
        var f2 = R2.isDir(l2.mode), p3 = R2.mayDelete(s2, i2, f2);
        if (p3 || (p3 = d2 ? R2.mayDelete(c2, a2, f2) : R2.mayCreate(c2, a2), p3)) throw new R2.ErrnoError(p3);
        if (!s2.node_ops.rename) throw new R2.ErrnoError(63);
        if (R2.isMountpoint(l2) || d2 && R2.isMountpoint(d2)) throw new R2.ErrnoError(10);
        if (c2 !== s2 && (p3 = R2.nodePermissions(s2, "w"), p3)) throw new R2.ErrnoError(p3);
        R2.hashRemoveNode(l2);
        try {
          s2.node_ops.rename(l2, c2, a2), l2.parent = c2;
        } catch (e32) {
          throw e32;
        } finally {
          R2.hashAddNode(l2);
        }
      }
    },
    rmdir(e31) {
      var t4 = R2.lookupPath(e31, { parent: true }).node, n3 = M2.basename(e31), r3 = R2.lookupNode(t4, n3), i2 = R2.mayDelete(t4, n3, true);
      if (i2) throw new R2.ErrnoError(i2);
      if (!t4.node_ops.rmdir) throw new R2.ErrnoError(63);
      if (R2.isMountpoint(r3)) throw new R2.ErrnoError(10);
      t4.node_ops.rmdir(t4, n3), R2.destroyNode(r3);
    },
    readdir(e31) {
      var t4 = R2.lookupPath(e31, { follow: true }).node;
      return R2.checkOpExists(t4.node_ops.readdir, 54)(t4);
    },
    unlink(e31) {
      var t4 = R2.lookupPath(e31, { parent: true }).node;
      if (!t4) throw new R2.ErrnoError(44);
      var n3 = M2.basename(e31), r3 = R2.lookupNode(t4, n3), i2 = R2.mayDelete(t4, n3, false);
      if (i2) throw new R2.ErrnoError(i2);
      if (!t4.node_ops.unlink) throw new R2.ErrnoError(63);
      if (R2.isMountpoint(r3)) throw new R2.ErrnoError(10);
      t4.node_ops.unlink(t4, n3), R2.destroyNode(r3);
    },
    readlink(e31) {
      var t4 = R2.lookupPath(e31).node;
      if (!t4) throw new R2.ErrnoError(44);
      if (!t4.node_ops.readlink) throw new R2.ErrnoError(28);
      return t4.node_ops.readlink(t4);
    },
    stat(e31, t4) {
      var n3 = R2.lookupPath(e31, { follow: !t4 }).node;
      return R2.checkOpExists(n3.node_ops.getattr, 63)(n3);
    },
    fstat(e31) {
      var t4 = R2.getStreamChecked(e31), n3 = t4.node, r3 = t4.stream_ops.getattr, i2 = r3 ? t4 : n3;
      return r3 ??= n3.node_ops.getattr, R2.checkOpExists(r3, 63), r3(i2);
    },
    lstat(e31) {
      return R2.stat(e31, true);
    },
    doChmod(e31, t4, n3, r3) {
      R2.doSetAttr(e31, t4, {
        mode: n3 & 4095 | t4.mode & -4096,
        ctime: Date.now(),
        dontFollow: r3
      });
    },
    chmod(e31, t4, n3) {
      var r3 = typeof e31 == "string" ? R2.lookupPath(e31, { follow: !n3 }).node : e31;
      R2.doChmod(null, r3, t4, n3);
    },
    lchmod(e31, t4) {
      R2.chmod(e31, t4, true);
    },
    fchmod(e31, t4) {
      var n3 = R2.getStreamChecked(e31);
      R2.doChmod(n3, n3.node, t4, false);
    },
    doChown(e31, t4, n3) {
      R2.doSetAttr(e31, t4, {
        timestamp: Date.now(),
        dontFollow: n3
      });
    },
    chown(e31, t4, n3, r3) {
      var i2 = typeof e31 == "string" ? R2.lookupPath(e31, { follow: !r3 }).node : e31;
      R2.doChown(null, i2, r3);
    },
    lchown(e31, t4, n3) {
      R2.chown(e31, t4, n3, true);
    },
    fchown(e31, t4, n3) {
      var r3 = R2.getStreamChecked(e31);
      R2.doChown(r3, r3.node, false);
    },
    doTruncate(e31, t4, n3) {
      if (R2.isDir(t4.mode)) throw new R2.ErrnoError(31);
      if (!R2.isFile(t4.mode)) throw new R2.ErrnoError(28);
      var r3 = R2.nodePermissions(t4, "w");
      if (r3) throw new R2.ErrnoError(r3);
      R2.doSetAttr(e31, t4, {
        size: n3,
        timestamp: Date.now()
      });
    },
    truncate(e31, t4) {
      if (t4 < 0) throw new R2.ErrnoError(28);
      var n3 = typeof e31 == "string" ? R2.lookupPath(e31, { follow: true }).node : e31;
      R2.doTruncate(null, n3, t4);
    },
    ftruncate(e31, t4) {
      var n3 = R2.getStreamChecked(e31);
      if (t4 < 0 || !(n3.flags & 2097155)) throw new R2.ErrnoError(28);
      R2.doTruncate(n3, n3.node, t4);
    },
    utime(e31, t4, n3, r3) {
      var i2 = R2.lookupPath(e31, { follow: !r3 });
      R2.doSetAttr(null, i2.node, {
        atime: t4,
        mtime: n3,
        dontFollow: r3
      });
    },
    open(e31, t4, n3 = 438) {
      if (e31 === "") throw new R2.ErrnoError(44);
      t4 = Re2(t4), n3 = t4 & 64 ? n3 & 4095 | 32768 : 0;
      var r3, i2;
      if (typeof e31 == "object") r3 = e31;
      else {
        i2 = e31.endsWith("/");
        var a2 = R2.lookupPath(e31, {
          follow: !(t4 & 131072),
          noent_okay: true
        });
        r3 = a2.node, e31 = a2.path;
      }
      var o2 = false;
      if (t4 & 64) {
        if (r3) {
          if (t4 & 128) throw new R2.ErrnoError(20);
        } else if (i2) throw new R2.ErrnoError(31);
        else r3 = R2.mknod(e31, n3 | 511, 0), o2 = true;
      }
      if (!r3) throw new R2.ErrnoError(44);
      if (R2.isChrdev(r3.mode) && (t4 &= -513), t4 & 65536 && !R2.isDir(r3.mode)) throw new R2.ErrnoError(54);
      if (!o2) {
        var s2 = R2.mayOpen(r3, t4);
        if (s2) throw new R2.ErrnoError(s2);
      }
      t4 & 512 && !o2 && R2.truncate(r3, 0), t4 &= -131713;
      var c2 = R2.createStream({
        node: r3,
        path: R2.getPath(r3),
        flags: t4,
        seekable: true,
        position: 0,
        stream_ops: r3.stream_ops,
        ungotten: [],
        error: false
      });
      return c2.stream_ops.open && c2.stream_ops.open(c2), o2 && R2.chmod(r3, n3 & 511), c2;
    },
    close(e31) {
      if (R2.isClosed(e31)) throw new R2.ErrnoError(8);
      e31.getdents &&= null, e31.node?.notifyListeners(32);
      try {
        e31.stream_ops.close && e31.stream_ops.close(e31);
      } catch (e32) {
        throw e32;
      } finally {
        R2.closeStream(e31.fd);
      }
      e31.fd = null;
    },
    isClosed(e31) {
      return e31.fd === null;
    },
    llseek(e31, t4, n3) {
      if (R2.isClosed(e31)) throw new R2.ErrnoError(8);
      if (!e31.seekable || !e31.stream_ops.llseek) throw new R2.ErrnoError(70);
      if (n3 != 0 && n3 != 1 && n3 != 2) throw new R2.ErrnoError(28);
      return e31.position = e31.stream_ops.llseek(e31, t4, n3), e31.ungotten = [], e31.position;
    },
    read(e31, t4, n3, r3, i2) {
      if (r3 < 0 || i2 < 0) throw new R2.ErrnoError(28);
      if (R2.isClosed(e31) || (e31.flags & 2097155) == 1) throw new R2.ErrnoError(8);
      if (R2.isDir(e31.node.mode)) throw new R2.ErrnoError(31);
      if (!e31.stream_ops.read) throw new R2.ErrnoError(28);
      var a2 = i2 !== void 0;
      if (!a2) i2 = e31.position;
      else if (!e31.seekable) throw new R2.ErrnoError(70);
      var o2 = e31.stream_ops.read(e31, t4, n3, r3, i2);
      return a2 || (e31.position += o2), o2;
    },
    write(e31, t4, n3, r3, i2, a2) {
      if (r3 < 0 || i2 < 0) throw new R2.ErrnoError(28);
      if (R2.isClosed(e31) || !(e31.flags & 2097155)) throw new R2.ErrnoError(8);
      if (R2.isDir(e31.node.mode)) throw new R2.ErrnoError(31);
      if (!e31.stream_ops.write) throw new R2.ErrnoError(28);
      e31.seekable && e31.flags & 1024 && R2.llseek(e31, 0, 2);
      var o2 = i2 !== void 0;
      if (!o2) i2 = e31.position;
      else if (!e31.seekable) throw new R2.ErrnoError(70);
      var s2 = e31.stream_ops.write(e31, t4, n3, r3, i2, a2);
      return o2 || (e31.position += s2), s2;
    },
    mmap(e31, t4, n3, r3, i2) {
      if (r3 & 2 && !(i2 & 2) && (e31.flags & 2097155) != 2 || (e31.flags & 2097155) == 1) throw new R2.ErrnoError(2);
      if (!e31.stream_ops.mmap) throw new R2.ErrnoError(43);
      if (!t4) throw new R2.ErrnoError(28);
      return e31.stream_ops.mmap(e31, t4, n3, r3, i2);
    },
    msync(e31, t4, n3, r3, i2) {
      return e31.stream_ops.msync ? e31.stream_ops.msync(e31, t4, n3, r3, i2) : 0;
    },
    ioctl(e31, t4, n3) {
      if (!e31.stream_ops.ioctl) throw new R2.ErrnoError(59);
      return e31.stream_ops.ioctl(e31, t4, n3);
    },
    readFile(e31, t4 = {}) {
      t4.flags = t4.flags ?? 0, t4.encoding = t4.encoding ?? "binary", t4.encoding !== "utf8" && t4.encoding !== "binary" && v2(`Invalid encoding type "${t4.encoding}"`);
      var n3 = R2.open(e31, t4.flags), r3 = R2.stat(e31).size, i2 = new Uint8Array(r3);
      return R2.read(n3, i2, 0, r3, 0), t4.encoding === "utf8" && (i2 = ke2(i2)), R2.close(n3), i2;
    },
    writeFile(e31, t4, n3 = {}) {
      n3.flags = n3.flags ?? 577;
      var r3 = R2.open(e31, n3.flags, n3.mode);
      t4 = ze2(t4), R2.write(r3, t4, 0, t4.byteLength, void 0, n3.canOwn), R2.close(r3);
    },
    cwd: () => R2.currentPath,
    chdir(e31) {
      var t4 = R2.lookupPath(e31, { follow: true });
      if (t4.node === null) throw new R2.ErrnoError(44);
      if (!R2.isDir(t4.node.mode)) throw new R2.ErrnoError(54);
      var n3 = R2.nodePermissions(t4.node, "x");
      if (n3) throw new R2.ErrnoError(n3);
      R2.currentPath = t4.path;
    },
    createDefaultDirectories() {
      R2.mkdir("/tmp"), R2.mkdir("/home"), R2.mkdir("/home/web_user");
    },
    createDefaultDevices() {
      R2.mkdir("/dev"), R2.registerDevice(R2.makedev(1, 3), {
        read: () => 0,
        write: (e32, t5, n4, r3, i2) => r3,
        llseek: () => 0
      }), R2.mkdev("/dev/null", R2.makedev(1, 3)), P2.register(R2.makedev(5, 0), P2.default_tty_ops), P2.register(R2.makedev(6, 0), P2.default_tty1_ops), R2.mkdev("/dev/tty", R2.makedev(5, 0)), R2.mkdev("/dev/tty1", R2.makedev(6, 0));
      var e31 = /* @__PURE__ */ new Uint8Array(1024), t4 = 0, n3 = () => (t4 ||= (Ee2(e31), e31.byteLength), e31[--t4]);
      R2.createDevice("/dev", "random", n3), R2.createDevice("/dev", "urandom", n3), R2.mkdir("/dev/shm"), R2.mkdir("/dev/shm/tmp");
    },
    createSpecialDirectories() {
      R2.mkdir("/proc");
      var e31 = R2.mkdir("/proc/self");
      R2.mkdir("/proc/self/fd"), R2.mount({ mount() {
        var t4 = R2.createNode(e31, "fd", 16895, 73);
        return t4.stream_ops = { llseek: I2.stream_ops.llseek }, t4.node_ops = {
          lookup(e32, t5) {
            var n3 = +t5, r3 = R2.getStreamChecked(n3), i2 = {
              parent: null,
              mount: { mountpoint: "fake" },
              node_ops: { readlink: () => r3.path },
              id: n3 + 1
            };
            return i2.parent = i2, i2;
          },
          readdir() {
            return Array.from(R2.streams.entries()).filter(([e32, t5]) => t5).map(([e32, t5]) => e32.toString());
          }
        }, t4;
      } }, {}, "/proc/self/fd");
    },
    createStandardStreams(e31, t4, n3) {
      e31 ? R2.createDevice("/dev", "stdin", e31) : R2.symlink("/dev/tty", "/dev/stdin"), t4 ? R2.createDevice("/dev", "stdout", null, t4) : R2.symlink("/dev/tty", "/dev/stdout"), n3 ? R2.createDevice("/dev", "stderr", null, n3) : R2.symlink("/dev/tty1", "/dev/stderr"), R2.open("/dev/stdin", 0), R2.open("/dev/stdout", 1), R2.open("/dev/stderr", 1);
    },
    staticInit() {
      R2.nameTable = Array(4096), R2.mount(I2, {}, "/"), R2.createDefaultDirectories(), R2.createDefaultDevices(), R2.createSpecialDirectories(), R2.filesystems = { MEMFS: I2 };
    },
    init(e31, t4, n3) {
      R2.initialized = true, R2.createStandardStreams(e31, t4, n3);
    },
    quit() {
      R2.initialized = false;
      for (var e31 of R2.streams) e31 && R2.close(e31);
    },
    findObject(e31, t4) {
      var n3 = R2.analyzePath(e31, t4);
      return n3.exists ? n3.object : null;
    },
    analyzePath(e31, t4) {
      try {
        var n3 = R2.lookupPath(e31, { follow: !t4 });
        e31 = n3.path;
      } catch {
      }
      var r3 = {
        isRoot: false,
        exists: false,
        error: 0,
        name: null,
        path: null,
        object: null,
        parentExists: false,
        parentPath: null,
        parentObject: null
      };
      try {
        var n3 = R2.lookupPath(e31, { parent: true });
        r3.parentExists = true, r3.parentPath = n3.path, r3.parentObject = n3.node, r3.name = M2.basename(e31), n3 = R2.lookupPath(e31, { follow: !t4 }), r3.exists = true, r3.path = n3.path, r3.object = n3.node, r3.name = n3.node.name, r3.isRoot = n3.path === "/";
      } catch (e32) {
        r3.error = e32.errno;
      }
      return r3;
    },
    createPath(e31, t4, n3, r3) {
      e31 = typeof e31 == "string" ? e31 : R2.getPath(e31);
      for (var i2 = t4.split("/").reverse(); i2.length; ) {
        var a2 = i2.pop();
        if (a2) {
          var o2 = M2.join2(e31, a2);
          try {
            R2.mkdir(o2);
          } catch (e32) {
            if (e32.errno != 20) throw e32;
          }
          e31 = o2;
        }
      }
      return o2;
    },
    createFile(e31, t4, n3, r3, i2) {
      var a2 = M2.join2(typeof e31 == "string" ? e31 : R2.getPath(e31), t4), o2 = L2(r3, i2);
      return R2.create(a2, o2);
    },
    createDataFile(e31, t4, n3, r3, i2, a2) {
      var o2 = t4;
      e31 && (e31 = typeof e31 == "string" ? e31 : R2.getPath(e31), o2 = t4 ? M2.join2(e31, t4) : e31);
      var s2 = L2(r3, i2), c2 = R2.create(o2, s2);
      if (n3) {
        n3 = ze2(n3), R2.chmod(c2, s2 | 146);
        var l2 = R2.open(c2, 577);
        R2.write(l2, n3, 0, n3.length, 0, a2), R2.close(l2), R2.chmod(c2, s2);
      }
    },
    createDevice(e31, t4, n3, r3) {
      var i2 = M2.join2(typeof e31 == "string" ? e31 : R2.getPath(e31), t4), a2 = L2(!!n3, !!r3);
      R2.createDevice.major ??= 64;
      var o2 = R2.makedev(R2.createDevice.major++, 0);
      return R2.registerDevice(o2, {
        open(e32) {
          e32.seekable = false;
        },
        close(e32) {
          r3?.buffer?.length && r3(10);
        },
        read(e32, t5, r4, i3, a3) {
          for (var o3 = 0, s2 = 0; s2 < i3; s2++) {
            var c2;
            try {
              c2 = n3();
            } catch {
              throw new R2.ErrnoError(29);
            }
            if (c2 === void 0 && !o3) throw new R2.ErrnoError(6);
            if (c2 == null) break;
            o3++, t5[r4 + s2] = c2;
          }
          return o3 && (e32.node.atime = Date.now()), o3;
        },
        write(e32, t5, n4, i3, a3) {
          for (var o3 = 0; o3 < i3; o3++) try {
            r3(t5[n4 + o3]);
          } catch {
            throw new R2.ErrnoError(29);
          }
          return i3 && (e32.node.mtime = e32.node.ctime = Date.now()), o3;
        }
      }), R2.mkdev(i2, a2, o2);
    },
    forceLoadFile(e31) {
      if (e31.isDevice || e31.isFolder || e31.link || e31.contents) return true;
      if (globalThis.XMLHttpRequest) v2("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
      else try {
        e31.contents = u(e31.url);
      } catch {
        throw new R2.ErrnoError(29);
      }
    },
    createLazyFile(e31, t4, n3, i2, a2) {
      class o2 {
        lengthKnown = false;
        chunks = [];
        get(e32) {
          if (!(e32 > this.length - 1 || e32 < 0)) {
            var t5 = e32 % this.chunkSize, n4 = e32 / this.chunkSize | 0;
            return this.getter(n4)[t5];
          }
        }
        setDataGetter(e32) {
          this.getter = e32;
        }
        cacheLength() {
          var e32 = new XMLHttpRequest();
          e32.open("HEAD", n3, false), e32.send(null), e32.status >= 200 && e32.status < 300 || e32.status === 304 || v2(`Couldn't load ${n3}. Status: ${e32.status}`);
          var t5 = Number(e32.getResponseHeader("Content-length")), r3, i3 = (r3 = e32.getResponseHeader("Accept-Ranges")) && r3 === "bytes", a3 = (r3 = e32.getResponseHeader("Content-Encoding")) && r3 === "gzip", o3 = 1048576;
          i3 || (o3 = t5);
          var s3 = (e33, r4) => {
            e33 > r4 && v2(`invalid range (${e33}, ${r4}) or no bytes requested!`), r4 > t5 - 1 && v2(`only ${t5} bytes available! programmer error!`);
            var i4 = new XMLHttpRequest();
            return i4.open("GET", n3, false), t5 !== o3 && i4.setRequestHeader("Range", `bytes=${e33}-${r4}`), i4.responseType = "arraybuffer", i4.overrideMimeType && i4.overrideMimeType("text/plain; charset=x-user-defined"), i4.send(null), i4.status >= 200 && i4.status < 300 || i4.status === 304 || v2(`Couldn't load ${n3}. Status: ${i4.status}`), i4.response === void 0 ? Ne2(i4.responseText ?? "", true) : new Uint8Array(i4.response || []);
          }, c3 = this;
          c3.setDataGetter((e33) => {
            var n4 = e33 * o3, r4 = (e33 + 1) * o3 - 1;
            return r4 = Math.min(r4, t5 - 1), c3.chunks[e33] === void 0 && (c3.chunks[e33] = s3(n4, r4)), c3.chunks[e33] === void 0 && v2("doXHR failed!"), c3.chunks[e33];
          }), (a3 || !t5) && (o3 = t5 = 1, t5 = this.getter(0).length, o3 = t5, d("LazyFiles on gzip forces download of the whole file when length is accessed")), this._length = t5, this._chunkSize = o3, this.lengthKnown = true;
        }
        get length() {
          return this.lengthKnown || this.cacheLength(), this._length;
        }
        get chunkSize() {
          return this.lengthKnown || this.cacheLength(), this._chunkSize;
        }
      }
      if (globalThis.XMLHttpRequest) {
        r2 || v2("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");
        var s2 = {
          isDevice: false,
          contents: new o2()
        };
      } else var s2 = {
        isDevice: false,
        url: n3
      };
      var c2 = R2.createFile(e31, t4, s2, i2, a2);
      s2.contents ? c2.contents = s2.contents : s2.url && (c2.contents = null, c2.url = s2.url), Object.defineProperties(c2, { usedBytes: { get: function() {
        return this.contents.length;
      } } });
      var l2 = {};
      for (let [e32, t5] of Object.entries(c2.stream_ops)) l2[e32] = (...e33) => (R2.forceLoadFile(c2), t5(...e33));
      function u2(e32, t5, n4, r3, i3) {
        var a3 = e32.node.contents;
        if (i3 >= a3.length) return 0;
        var o3 = Math.min(a3.length - i3, r3);
        if (a3.slice) for (var s3 = 0; s3 < o3; s3++) t5[n4 + s3] = a3[i3 + s3];
        else for (var s3 = 0; s3 < o3; s3++) t5[n4 + s3] = a3.get(i3 + s3);
        return o3;
      }
      return l2.read = (e32, t5, n4, r3, i3) => (R2.forceLoadFile(c2), u2(e32, t5, n4, r3, i3)), l2.mmap = (e32, t5, n4, r3, i3) => {
        R2.forceLoadFile(c2);
        var a3 = Le2(t5);
        if (!a3) throw new R2.ErrnoError(48);
        return u2(e32, b2, a3, t5, n4), {
          ptr: a3,
          allocated: true
        };
      }, c2.stream_ops = l2, c2;
    }
  }, $e = (e31, t4, n3) => (e31 >>>= 0, e31 ? ke2(F2, e31, t4, n3) : ""), z2, B2, V2 = {
    currentUmask: 18,
    calculateAt(e31, t4, n3) {
      if (M2.isAbs(t4)) return t4;
      var r3 = e31 === -100 ? R2.cwd() : V2.getStreamFromFD(e31).path;
      if (t4.length == 0) {
        if (!n3) throw new R2.ErrnoError(44);
        return r3;
      }
      return r3 + "/" + t4;
    },
    writeStat(e31, t4) {
      k2[e31 >>> 2 >>> 0] = t4.dev, k2[e31 + 4 >>> 2 >>> 0] = t4.mode, k2[e31 + 8 >>> 2 >>> 0] = t4.nlink, k2[e31 + 12 >>> 2 >>> 0] = t4.uid, k2[e31 + 16 >>> 2 >>> 0] = t4.gid, k2[e31 + 20 >>> 2 >>> 0] = t4.rdev, B2[e31 + 24 >>> 3 >>> 0] = BigInt(t4.size), z2[e31 + 32 >>> 2 >>> 0] = 4096, z2[e31 + 36 >>> 2 >>> 0] = t4.blocks;
      var n3 = t4.atime.getTime(), r3 = t4.mtime.getTime(), i2 = t4.ctime.getTime();
      return B2[e31 + 40 >>> 3 >>> 0] = BigInt(Math.floor(n3 / 1e3)), k2[e31 + 48 >>> 2 >>> 0] = n3 % 1e3 * 1e3 * 1e3, B2[e31 + 56 >>> 3 >>> 0] = BigInt(Math.floor(r3 / 1e3)), k2[e31 + 64 >>> 2 >>> 0] = r3 % 1e3 * 1e3 * 1e3, B2[e31 + 72 >>> 3 >>> 0] = BigInt(Math.floor(i2 / 1e3)), k2[e31 + 80 >>> 2 >>> 0] = i2 % 1e3 * 1e3 * 1e3, B2[e31 + 88 >>> 3 >>> 0] = BigInt(t4.ino), 0;
    },
    writeStatFs(e31, t4) {
      k2[e31 + 4 >>> 2 >>> 0] = t4.bsize, k2[e31 + 60 >>> 2 >>> 0] = t4.bsize, B2[e31 + 8 >>> 3 >>> 0] = BigInt(t4.blocks), B2[e31 + 16 >>> 3 >>> 0] = BigInt(t4.bfree), B2[e31 + 24 >>> 3 >>> 0] = BigInt(t4.bavail), B2[e31 + 32 >>> 3 >>> 0] = BigInt(t4.files), B2[e31 + 40 >>> 3 >>> 0] = BigInt(t4.ffree), k2[e31 + 48 >>> 2 >>> 0] = t4.fsid, k2[e31 + 64 >>> 2 >>> 0] = t4.flags, k2[e31 + 56 >>> 2 >>> 0] = t4.namelen;
    },
    doMsync(e31, t4, n3, r3, i2) {
      if (!R2.isFile(t4.node.mode)) throw new R2.ErrnoError(43);
      if (r3 & 2) return 0;
      var a2 = F2.subarray(e31 >>> 0, e31 + n3 >>> 0);
      R2.msync(t4, a2, i2, n3, r3);
    },
    getStreamFromFD(e31) {
      return R2.getStreamChecked(e31);
    },
    varargs: void 0,
    getStr(e31) {
      return $e(e31);
    }
  };
  function H2(e31, t4) {
    e31 >>>= 0;
    try {
      return e31 = V2.getStr(e31), R2.chmod(e31, t4), 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function et2(e31) {
    try {
      var t4 = V2.getStreamFromFD(e31);
      return R2.dupStream(t4).fd;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function tt(e31, t4, n3, r3) {
    t4 >>>= 0;
    try {
      if (t4 = V2.getStr(t4), t4 = V2.calculateAt(e31, t4), n3 & -8) return -28;
      var i2 = R2.lookupPath(t4, { follow: true }).node;
      if (!i2) return -44;
      var a2 = "";
      return n3 & 4 && (a2 += "r"), n3 & 2 && (a2 += "w"), n3 & 1 && (a2 += "x"), a2 && R2.nodePermissions(i2, a2) ? -2 : 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function nt2(e31, t4, n3, r3) {
    n3 = C2(n3), r3 = C2(r3);
    try {
      if (isNaN(n3) || isNaN(r3)) return -22;
      if (t4 != 0) return -138;
      if (n3 < 0 || r3 < 0) return -28;
      if (!V2.getStreamFromFD(e31).seekable) return -70;
      var i2 = R2.fstat(e31).size, a2 = n3 + r3;
      return a2 > i2 && R2.ftruncate(e31, a2), 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function rt2(e31, t4) {
    try {
      return R2.fchmod(e31, t4), 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  var it2 = () => {
    var e31 = z2[V2.varargs >>> 2 >>> 0];
    return V2.varargs += 4, e31;
  }, U2 = it2, W2;
  function at(e31, t4, n3) {
    n3 >>>= 0, V2.varargs = n3;
    try {
      var r3 = V2.getStreamFromFD(e31);
      switch (t4) {
        case 0:
          var i2 = it2();
          if (i2 < 0) return -28;
          for (; R2.streams[i2]; ) i2++;
          return R2.dupStream(r3, i2).fd;
        case 1:
        case 2:
          return 0;
        case 3:
          return r3.flags;
        case 4:
          var i2 = it2(), a2 = 289792;
          return r3.flags = r3.flags & ~a2 | i2 & a2, 0;
        case 12:
          var i2 = U2(), o2 = 0;
          return W2[i2 + o2 >>> 1 >>> 0] = 2, 0;
        case 13:
        case 14:
          return 0;
      }
      return -28;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function ot(e31, t4) {
    t4 >>>= 0;
    try {
      return V2.writeStat(t4, R2.fstat(e31));
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  var st = (e31, t4, n3) => Me2(e31, F2, t4, n3);
  function ct(e31, t4) {
    e31 >>>= 0, t4 >>>= 0;
    try {
      if (!t4) return -28;
      var n3 = R2.cwd(), r3 = je2(n3) + 1;
      return t4 < r3 ? -68 : (st(n3, e31, t4), r3);
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function lt(e31, t4, n3) {
    t4 >>>= 0, n3 >>>= 0;
    try {
      var r3 = V2.getStreamFromFD(e31);
      r3.getdents ||= R2.readdir(r3.path);
      for (var i2 = 280, a2 = 0, o2 = R2.llseek(r3, 0, 1), s2 = Math.floor(o2 / i2), c2 = Math.min(r3.getdents.length, s2 + Math.floor(n3 / i2)), l2 = s2; l2 < c2; l2++) {
        var u2, d2, f2 = r3.getdents[l2];
        if (f2 === ".") u2 = r3.node.id, d2 = 4;
        else if (f2 === "..") u2 = R2.lookupPath(r3.path, { parent: true }).node.id, d2 = 4;
        else {
          var p3;
          try {
            p3 = R2.lookupNode(r3.node, f2);
          } catch (e32) {
            if (e32?.errno === 28) continue;
            throw e32;
          }
          u2 = p3.id, d2 = R2.isChrdev(p3.mode) ? 2 : R2.isDir(p3.mode) ? 4 : R2.isLink(p3.mode) ? 10 : 8;
        }
        B2[t4 + a2 >>> 3 >>> 0] = BigInt(u2), B2[t4 + a2 + 8 >>> 3 >>> 0] = BigInt((l2 + 1) * i2), W2[t4 + a2 + 16 >>> 1 >>> 0] = 280, b2[t4 + a2 + 18 >>> 0] = d2, st(f2, t4 + a2 + 19, 256), a2 += i2;
      }
      return R2.llseek(r3, l2 * i2, 0), a2;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function ut(e31, t4, n3) {
    n3 >>>= 0, V2.varargs = n3;
    try {
      var r3 = V2.getStreamFromFD(e31);
      switch (t4) {
        case 21509:
          return r3.tty ? 0 : -59;
        case 21505:
          if (!r3.tty) return -59;
          if (r3.tty.ops.ioctl_tcgets) {
            var i2 = r3.tty.ops.ioctl_tcgets(r3), a2 = U2();
            z2[a2 >>> 2 >>> 0] = i2.c_iflag || 0, z2[a2 + 4 >>> 2 >>> 0] = i2.c_oflag || 0, z2[a2 + 8 >>> 2 >>> 0] = i2.c_cflag || 0, z2[a2 + 12 >>> 2 >>> 0] = i2.c_lflag || 0;
            for (var o2 = 0; o2 < 32; o2++) b2[a2 + o2 + 17 >>> 0] = i2.c_cc[o2] || 0;
            return 0;
          }
          return 0;
        case 21510:
        case 21511:
        case 21512:
          return r3.tty ? 0 : -59;
        case 21506:
        case 21507:
        case 21508:
          if (!r3.tty) return -59;
          if (r3.tty.ops.ioctl_tcsets) {
            for (var a2 = U2(), s2 = z2[a2 >>> 2 >>> 0], c2 = z2[a2 + 4 >>> 2 >>> 0], l2 = z2[a2 + 8 >>> 2 >>> 0], u2 = z2[a2 + 12 >>> 2 >>> 0], d2 = [], o2 = 0; o2 < 32; o2++) d2.push(b2[a2 + o2 + 17 >>> 0]);
            return r3.tty.ops.ioctl_tcsets(r3.tty, t4, {
              c_iflag: s2,
              c_oflag: c2,
              c_cflag: l2,
              c_lflag: u2,
              c_cc: d2
            });
          }
          return 0;
        case 21519:
          if (!r3.tty) return -59;
          var a2 = U2();
          return z2[a2 >>> 2 >>> 0] = 0, 0;
        case 21520:
          return r3.tty ? -28 : -59;
        case 21537:
        case 21531:
          var a2 = U2();
          return R2.ioctl(r3, t4, a2);
        case 21523:
          if (!r3.tty) return -59;
          if (r3.tty.ops.ioctl_tiocgwinsz) {
            var f2 = r3.tty.ops.ioctl_tiocgwinsz(r3.tty), a2 = U2();
            W2[a2 >>> 1 >>> 0] = f2[0], W2[a2 + 2 >>> 1 >>> 0] = f2[1];
          }
          return 0;
        case 21524:
          return r3.tty ? 0 : -59;
        case 21515:
          return r3.tty ? 0 : -59;
        default:
          return -28;
      }
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function dt(e31, t4) {
    e31 >>>= 0, t4 >>>= 0;
    try {
      return e31 = V2.getStr(e31), V2.writeStat(t4, R2.lstat(e31));
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function ft(e31, t4, n3, r3) {
    t4 >>>= 0, n3 >>>= 0;
    try {
      t4 = V2.getStr(t4);
      var i2 = r3 & 256, a2 = r3 & 4096;
      return r3 &= -6401, t4 = V2.calculateAt(e31, t4, a2), V2.writeStat(n3, i2 ? R2.lstat(t4) : R2.stat(t4));
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function pt(e31, t4, n3, r3) {
    t4 >>>= 0, r3 >>>= 0, V2.varargs = r3;
    try {
      t4 = V2.getStr(t4), t4 = V2.calculateAt(e31, t4);
      var i2 = r3 ? it2() : 0;
      return n3 & 64 && (i2 &= ~V2.currentUmask), R2.open(t4, n3, i2).fd;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function mt(e31, t4, n3, r3) {
    t4 >>>= 0, n3 >>>= 0, r3 >>>= 0;
    try {
      if (t4 = V2.getStr(t4), t4 = V2.calculateAt(e31, t4), r3 <= 0) return -28;
      var i2 = R2.readlink(t4), a2 = Math.min(r3, je2(i2)), o2 = b2[n3 + a2 >>> 0];
      return st(i2, n3, r3 + 1), b2[n3 + a2 >>> 0] = o2, a2;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function ht(e31, t4, n3, r3) {
    t4 >>>= 0, r3 >>>= 0;
    try {
      return t4 = V2.getStr(t4), r3 = V2.getStr(r3), t4 = V2.calculateAt(e31, t4), r3 = V2.calculateAt(n3, r3), R2.rename(t4, r3), 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function gt(e31) {
    e31 >>>= 0;
    try {
      return e31 = V2.getStr(e31), R2.rmdir(e31), 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function _t(e31, t4) {
    e31 >>>= 0, t4 >>>= 0;
    try {
      return e31 = V2.getStr(e31), V2.writeStat(t4, R2.stat(e31));
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function vt(e31, t4, n3) {
    e31 >>>= 0, n3 >>>= 0;
    try {
      return e31 = V2.getStr(e31), n3 = V2.getStr(n3), n3 = V2.calculateAt(t4, n3), R2.symlink(e31, n3), 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function yt(e31, t4, n3) {
    t4 >>>= 0;
    try {
      if (t4 = V2.getStr(t4), t4 = V2.calculateAt(e31, t4), !n3) R2.unlink(t4);
      else if (n3 === 512) R2.rmdir(t4);
      else return -28;
      return 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  var bt = () => v2(""), xt = {}, St = (e31) => {
    for (; e31.length; ) {
      var t4 = e31.pop();
      e31.pop()(t4);
    }
  };
  function Ct(e31) {
    return this.fromWireType(k2[e31 >>> 2 >>> 0]);
  }
  var wt = {}, Tt = {}, Et = {};
  class Dt extends Error {
    constructor(e31) {
      super(e31), this.name = "InternalError";
    }
  }
  var Ot = (e31) => {
    throw new Dt(e31);
  }, kt = (e31, t4, n3) => {
    e31.forEach((e32) => Et[e32] = t4);
    function r3(t5) {
      var r4 = n3(t5);
      r4.length !== e31.length && Ot("Mismatched type converter count");
      for (var i3 = 0; i3 < e31.length; ++i3) jt2(e31[i3], r4[i3]);
    }
    var i2 = Array(t4.length), a2 = [], o2 = 0;
    for (let [e32, n4] of t4.entries()) Tt.hasOwnProperty(n4) ? i2[e32] = Tt[n4] : (a2.push(n4), wt.hasOwnProperty(n4) || (wt[n4] = []), wt[n4].push(() => {
      i2[e32] = Tt[n4], ++o2, o2 === a2.length && r3(i2);
    }));
    a2.length === 0 && r3(i2);
  }, At = function(e31) {
    e31 >>>= 0;
    var t4 = xt[e31];
    delete xt[e31];
    var n3 = t4.rawConstructor, r3 = t4.rawDestructor, i2 = t4.fields, a2 = i2.map((e32) => e32.getterReturnType).concat(i2.map((e32) => e32.setterArgumentType));
    kt([e31], a2, (e32) => {
      var a3 = {};
      for (var [o2, s2] of i2.entries()) {
        let t5 = e32[o2], n4 = s2.getter, r4 = s2.getterContext, c2 = e32[o2 + i2.length], l2 = s2.setter, u2 = s2.setterContext;
        a3[s2.fieldName] = {
          read: (e33) => t5.fromWireType(n4(r4, e33)),
          write: (e33, t6) => {
            var n5 = [];
            l2(u2, e33, c2.toWireType(n5, t6)), St(n5);
          },
          optional: t5.optional
        };
      }
      return [{
        name: t4.name,
        fromWireType: (e33) => {
          var t5 = {};
          for (var n4 in a3) t5[n4] = a3[n4].read(e33);
          return r3(e33), t5;
        },
        toWireType: (e33, t5) => {
          for (var i3 in a3) if (!(i3 in t5) && !a3[i3].optional) throw TypeError(`Missing field: "${i3}"`);
          var o3 = n3();
          for (i3 in a3) a3[i3].write(o3, t5[i3]);
          return e33 !== null && e33.push(r3, o3), o3;
        },
        readValueFromPointer: Ct,
        destructorFunction: r3
      }];
    });
  }, G = (e31) => {
    e31 >>>= 0;
    for (var t4 = ""; ; ) {
      var n3 = F2[e31++ >>> 0];
      if (!n3) return t4;
      t4 += String.fromCharCode(n3);
    }
  };
  class K extends Error {
    constructor(e31) {
      super(e31), this.name = "BindingError";
    }
  }
  var q = (e31) => {
    throw new K(e31);
  };
  function J(e31, t4, n3 = {}) {
    var r3 = t4.name;
    if (e31 || q(`type "${r3}" must have a positive integer typeid pointer`), Tt.hasOwnProperty(e31)) {
      if (n3.ignoreDuplicateRegistrations) return;
      q(`Cannot register type '${r3}' twice`);
    }
    if (Tt[e31] = t4, delete Et[e31], wt.hasOwnProperty(e31)) {
      var i2 = wt[e31];
      delete wt[e31], i2.forEach((e32) => e32());
    }
  }
  function jt2(e31, t4, n3 = {}) {
    return J(e31, t4, n3);
  }
  var Y, Mt, Nt = (e31, t4, n3) => {
    switch (t4) {
      case 1:
        return n3 ? (e32) => b2[e32 >>> 0] : (e32) => F2[e32 >>> 0];
      case 2:
        return n3 ? (e32) => W2[e32 >>> 1 >>> 0] : (e32) => Y[e32 >>> 1 >>> 0];
      case 4:
        return n3 ? (e32) => z2[e32 >>> 2 >>> 0] : (e32) => k2[e32 >>> 2 >>> 0];
      case 8:
        return n3 ? (e32) => B2[e32 >>> 3 >>> 0] : (e32) => Mt[e32 >>> 3 >>> 0];
      default:
        throw TypeError(`invalid integer width (${t4}): ${e31}`);
    }
  }, Pt = function(e31, t4, n3, r3, i2) {
    e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, t4 = G(t4);
    let a2 = r3 === 0n, o2 = (e32) => e32;
    if (a2) {
      let e32 = n3 * 8;
      o2 = (t5) => BigInt.asUintN(e32, t5), i2 = o2(i2);
    }
    jt2(e31, {
      name: t4,
      fromWireType: o2,
      toWireType: (e32, t5) => (typeof t5 == "number" && (t5 = BigInt(t5)), t5),
      readValueFromPointer: Nt(t4, n3, !a2),
      destructorFunction: null
    });
  };
  function Ft(e31, t4, n3, r3) {
    e31 >>>= 0, t4 >>>= 0, t4 = G(t4), jt2(e31, {
      name: t4,
      fromWireType: function(e32) {
        return !!e32;
      },
      toWireType: function(e32, t5) {
        return t5 ? n3 : r3;
      },
      readValueFromPointer: function(e32) {
        return this.fromWireType(F2[e32 >>> 0]);
      },
      destructorFunction: null
    });
  }
  var It = (e31) => ({
    count: e31.count,
    deleteScheduled: e31.deleteScheduled,
    preservePointerOnDelete: e31.preservePointerOnDelete,
    ptr: e31.ptr,
    ptrType: e31.ptrType,
    smartPtr: e31.smartPtr,
    smartPtrType: e31.smartPtrType
  }), Lt2 = (e31) => {
    function t4(e32) {
      return e32.$$.ptrType.registeredClass.name;
    }
    q(t4(e31) + " instance already deleted");
  }, Rt = false, zt = (e31) => {
  }, Bt = (e31) => {
    e31.smartPtr ? e31.smartPtrType.rawDestructor(e31.smartPtr) : e31.ptrType.registeredClass.rawDestructor(e31.ptr);
  }, Vt2 = (e31) => {
    --e31.count.value, e31.count.value === 0 && Bt(e31);
  }, Ht = (e31) => globalThis.FinalizationRegistry ? (Rt = new FinalizationRegistry((e32) => {
    Vt2(e32.$$);
  }), Ht = (e32) => {
    var t4 = e32.$$;
    if (t4.smartPtr) {
      var n3 = { $$: t4 };
      Rt.register(e32, n3, e32);
    }
    return e32;
  }, zt = (e32) => Rt.unregister(e32), Ht(e31)) : (Ht = (e32) => e32, e31), Ut = [], Wt = () => {
    for (; Ut.length; ) {
      var e31 = Ut.pop();
      e31.$$.deleteScheduled = false, e31.delete();
    }
  }, Gt, Kt = () => {
    let e31 = qt.prototype;
    Object.assign(e31, {
      isAliasOf(e32) {
        if (!(this instanceof qt) || !(e32 instanceof qt)) return false;
        var t5 = this.$$.ptrType.registeredClass, n3 = this.$$.ptr;
        e32.$$ = e32.$$;
        for (var r3 = e32.$$.ptrType.registeredClass, i2 = e32.$$.ptr; t5.baseClass; ) n3 = t5.upcast(n3), t5 = t5.baseClass;
        for (; r3.baseClass; ) i2 = r3.upcast(i2), r3 = r3.baseClass;
        return t5 === r3 && n3 === i2;
      },
      clone() {
        if (this.$$.ptr || Lt2(this), this.$$.preservePointerOnDelete) return this.$$.count.value += 1, this;
        var e32 = Ht(Object.create(Object.getPrototypeOf(this), { $$: { value: It(this.$$) } }));
        return e32.$$.count.value += 1, e32.$$.deleteScheduled = false, e32;
      },
      delete() {
        this.$$.ptr || Lt2(this), this.$$.deleteScheduled && !this.$$.preservePointerOnDelete && q("Object already scheduled for deletion"), zt(this), Vt2(this.$$), this.$$.preservePointerOnDelete || (this.$$.smartPtr = void 0, this.$$.ptr = void 0);
      },
      isDeleted() {
        return !this.$$.ptr;
      },
      deleteLater() {
        return this.$$.ptr || Lt2(this), this.$$.deleteScheduled && !this.$$.preservePointerOnDelete && q("Object already scheduled for deletion"), Ut.push(this), Ut.length === 1 && Gt && Gt(Wt), this.$$.deleteScheduled = true, this;
      }
    });
    let t4 = Symbol.dispose;
    t4 && (e31[t4] = e31.delete);
  };
  function qt() {
  }
  var Jt = (e31, t4) => Object.defineProperty(t4, "name", { value: e31 }), Yt = {}, Xt2 = (e31, t4, n3) => {
    if (e31[t4].overloadTable === void 0) {
      var r3 = e31[t4];
      e31[t4] = function(...r4) {
        return e31[t4].overloadTable.hasOwnProperty(r4.length) || q(`Function '${n3}' called with an invalid number of arguments (${r4.length}) - expects one of (${e31[t4].overloadTable})!`), e31[t4].overloadTable[r4.length].apply(this, r4);
      }, e31[t4].overloadTable = [], e31[t4].overloadTable[r3.argCount] = r3;
    }
  }, Zt2 = (e31, n3, r3) => {
    t3.hasOwnProperty(e31) ? ((r3 === void 0 || t3[e31].overloadTable !== void 0 && t3[e31].overloadTable[r3] !== void 0) && q(`Cannot register public name '${e31}' twice`), Xt2(t3, e31, e31), t3[e31].overloadTable.hasOwnProperty(r3) && q(`Cannot register multiple overloads of a function with the same number of arguments (${r3})!`), t3[e31].overloadTable[r3] = n3) : (t3[e31] = n3, t3[e31].argCount = r3);
  }, Qt = 48, $t = 57, en = (e31) => {
    e31 = e31.replace(/[^a-zA-Z0-9_]/g, "$");
    var t4 = e31.charCodeAt(0);
    return t4 >= Qt && t4 <= $t ? `_${e31}` : e31;
  };
  function tn(e31, t4, n3, r3, i2, a2, o2, s2) {
    this.name = e31, this.constructor = t4, this.instancePrototype = n3, this.rawDestructor = r3, this.baseClass = i2, this.getActualType = a2, this.upcast = o2, this.downcast = s2, this.pureVirtualFunctions = [];
  }
  var nn = (e31, t4, n3) => {
    for (; t4 !== n3; ) t4.upcast || q(`Expected null or instance of ${n3.name}, got an instance of ${t4.name}`), e31 = t4.upcast(e31), t4 = t4.baseClass;
    return e31;
  }, rn = (e31) => {
    if (e31 === null) return "null";
    var t4 = typeof e31;
    return t4 === "object" || t4 === "array" || t4 === "function" ? e31.toString() : "" + e31;
  };
  function an(e31, t4) {
    if (t4 === null) return this.isReference && q(`null is not a valid ${this.name}`), 0;
    t4.$$ || q(`Cannot pass "${rn(t4)}" as a ${this.name}`), t4.$$.ptr || q(`Cannot pass deleted object as a pointer of type ${this.name}`);
    var n3 = t4.$$.ptrType.registeredClass;
    return nn(t4.$$.ptr, n3, this.registeredClass);
  }
  function on(e31, t4) {
    var n3;
    if (t4 === null) return this.isReference && q(`null is not a valid ${this.name}`), this.isSmartPointer ? (n3 = this.rawConstructor(), e31 !== null && e31.push(this.rawDestructor, n3), n3) : 0;
    (!t4 || !t4.$$) && q(`Cannot pass "${rn(t4)}" as a ${this.name}`), t4.$$.ptr || q(`Cannot pass deleted object as a pointer of type ${this.name}`), !this.isConst && t4.$$.ptrType.isConst && q(`Cannot convert argument of type ${t4.$$.smartPtrType ? t4.$$.smartPtrType.name : t4.$$.ptrType.name} to parameter type ${this.name}`);
    var r3 = t4.$$.ptrType.registeredClass;
    if (n3 = nn(t4.$$.ptr, r3, this.registeredClass), this.isSmartPointer) switch (t4.$$.smartPtr === void 0 && q("Passing raw pointer to smart pointer is illegal"), this.sharingPolicy) {
      case 0:
        t4.$$.smartPtrType === this ? n3 = t4.$$.smartPtr : q(`Cannot convert argument of type ${t4.$$.smartPtrType ? t4.$$.smartPtrType.name : t4.$$.ptrType.name} to parameter type ${this.name}`);
        break;
      case 1:
        n3 = t4.$$.smartPtr;
        break;
      case 2:
        if (t4.$$.smartPtrType === this) n3 = t4.$$.smartPtr;
        else {
          var i2 = t4.clone();
          n3 = this.rawShare(n3, Z.toHandle(() => i2.delete())), e31 !== null && e31.push(this.rawDestructor, n3);
        }
        break;
      default:
        q("Unsupported sharing policy");
    }
    return n3;
  }
  function sn(e31, t4) {
    if (t4 === null) return this.isReference && q(`null is not a valid ${this.name}`), 0;
    t4.$$ || q(`Cannot pass "${rn(t4)}" as a ${this.name}`), t4.$$.ptr || q(`Cannot pass deleted object as a pointer of type ${this.name}`), t4.$$.ptrType.isConst && q(`Cannot convert argument of type ${t4.$$.ptrType.name} to parameter type ${this.name}`);
    var n3 = t4.$$.ptrType.registeredClass;
    return nn(t4.$$.ptr, n3, this.registeredClass);
  }
  var cn = (e31, t4, n3) => {
    if (t4 === n3) return e31;
    if (n3.baseClass === void 0) return null;
    var r3 = cn(e31, t4, n3.baseClass);
    return r3 === null ? null : n3.downcast(r3);
  }, ln = {}, un = (e31, t4) => {
    for (t4 === void 0 && q("ptr should not be undefined"); e31.baseClass; ) t4 = e31.upcast(t4), e31 = e31.baseClass;
    return t4;
  }, dn = (e31, t4) => (t4 = un(e31, t4), ln[t4]), fn = (e31, t4) => ((!t4.ptrType || !t4.ptr) && Ot("makeClassHandle requires ptr and ptrType"), !!t4.smartPtrType != !!t4.smartPtr && Ot("Both smartPtrType and smartPtr must be specified"), t4.count = { value: 1 }, Ht(Object.create(e31, { $$: {
    value: t4,
    writable: true
  } })));
  function pn(e31) {
    var t4 = this.getPointee(e31);
    if (!t4) return this.destructor(e31), null;
    var n3 = dn(this.registeredClass, t4);
    if (n3 !== void 0) {
      if (n3.$$.count.value === 0) return n3.$$.ptr = t4, n3.$$.smartPtr = e31, n3.clone();
      var r3 = n3.clone();
      return this.destructor(e31), r3;
    }
    function i2() {
      return this.isSmartPointer ? fn(this.registeredClass.instancePrototype, {
        ptrType: this.pointeeType,
        ptr: t4,
        smartPtrType: this,
        smartPtr: e31
      }) : fn(this.registeredClass.instancePrototype, {
        ptrType: this,
        ptr: e31
      });
    }
    var a2 = Yt[this.registeredClass.getActualType(t4)];
    if (!a2) return i2.call(this);
    var o2 = this.isConst ? a2.constPointerType : a2.pointerType, s2 = cn(t4, this.registeredClass, o2.registeredClass);
    return s2 === null ? i2.call(this) : this.isSmartPointer ? fn(o2.registeredClass.instancePrototype, {
      ptrType: o2,
      ptr: s2,
      smartPtrType: this,
      smartPtr: e31
    }) : fn(o2.registeredClass.instancePrototype, {
      ptrType: o2,
      ptr: s2
    });
  }
  var mn = () => {
    Object.assign(hn.prototype, {
      getPointee(e31) {
        return this.rawGetPointee && (e31 = this.rawGetPointee(e31)), e31;
      },
      destructor(e31) {
        this.rawDestructor?.(e31);
      },
      readValueFromPointer: Ct,
      fromWireType: pn
    });
  };
  function hn(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2, u2) {
    this.name = e31, this.registeredClass = t4, this.isReference = n3, this.isConst = r3, this.isSmartPointer = i2, this.pointeeType = a2, this.sharingPolicy = o2, this.rawGetPointee = s2, this.rawConstructor = c2, this.rawShare = l2, this.rawDestructor = u2, !i2 && t4.baseClass === void 0 ? r3 ? (this.toWireType = an, this.destructorFunction = null) : (this.toWireType = sn, this.destructorFunction = null) : this.toWireType = on;
  }
  var gn = (e31, n3, r3) => {
    t3.hasOwnProperty(e31) || Ot("Replacing nonexistent public symbol"), t3[e31].overloadTable !== void 0 && r3 !== void 0 ? t3[e31].overloadTable[r3] = n3 : (t3[e31] = n3, t3[e31].argCount = r3);
  }, _n = (e31, t4, n3 = [], r3 = false) => {
    var i2 = T2(t4)(...n3);
    function a2(t5) {
      return e31[0] == "p" ? t5 >>> 0 : t5;
    }
    return a2(i2);
  }, vn = (e31, t4, n3 = false) => (...r3) => _n(e31, t4, r3, n3), X = (e31, t4, n3 = false) => {
    e31 = G(e31);
    function r3() {
      return e31.includes("p") ? vn(e31, t4, n3) : T2(t4);
    }
    var i2 = r3();
    return typeof i2 != "function" && q(`unknown function pointer with signature ${e31}: ${t4}`), i2;
  };
  class yn extends Error {
  }
  var bn = (e31) => {
    var t4 = yi(e31), n3 = G(t4);
    return Q(t4), n3;
  }, xn = (e31, t4) => {
    var n3 = [], r3 = {};
    function i2(e32) {
      r3[e32] || Tt[e32] || (Et[e32] ? Et[e32].forEach(i2) : (n3.push(e32), r3[e32] = true));
    }
    throw t4.forEach(i2), new yn(`${e31}: ` + n3.map(bn).join([", "]));
  };
  function Sn(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2, u2, d2, f2) {
    e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, r3 >>>= 0, i2 >>>= 0, a2 >>>= 0, o2 >>>= 0, s2 >>>= 0, c2 >>>= 0, l2 >>>= 0, u2 >>>= 0, d2 >>>= 0, f2 >>>= 0, u2 = G(u2), a2 = X(i2, a2), s2 &&= X(o2, s2), l2 &&= X(c2, l2), f2 = X(d2, f2);
    var p3 = en(u2);
    Zt2(p3, function() {
      xn(`Cannot construct ${u2} due to unbound types`, [r3]);
    }), kt([
      e31,
      t4,
      n3
    ], r3 ? [r3] : [], (t5) => {
      t5 = t5[0];
      var n4, i3;
      r3 ? (n4 = t5.registeredClass, i3 = n4.instancePrototype) : i3 = qt.prototype;
      var o3 = Jt(u2, function(...e32) {
        if (Object.getPrototypeOf(this) !== c3) throw new K(`Use 'new' to construct ${u2}`);
        if (d3.constructor_body === void 0) throw new K(`${u2} has no accessible constructor`);
        var t6 = d3.constructor_body[e32.length];
        if (t6 === void 0) throw new K(`Tried to invoke ctor of ${u2} with invalid number of parameters (${e32.length}) - expected (${Object.keys(d3.constructor_body).toString()}) parameters instead!`);
        return t6.apply(this, e32);
      }), c3 = Object.create(i3, { constructor: { value: o3 } });
      o3.prototype = c3;
      var d3 = new tn(u2, o3, c3, f2, n4, a2, s2, l2);
      d3.baseClass && (d3.baseClass.__derivedClasses ??= [], d3.baseClass.__derivedClasses.push(d3));
      var m3 = new hn(u2, d3, true, false, false), h3 = new hn(u2 + "*", d3, false, false, false), g3 = new hn(u2 + " const*", d3, false, true, false);
      return Yt[e31] = {
        pointerType: h3,
        constPointerType: g3
      }, gn(p3, o3), [
        m3,
        h3,
        g3
      ];
    });
  }
  var Cn = [], wn = [
    0,
    1,
    ,
    1,
    null,
    1,
    true,
    1,
    false,
    1
  ], Tn = [];
  function En(e31) {
    if (e31 >>>= 0, e31 > 9 && --wn[e31 + 1] === 0) {
      var t4 = wn[e31];
      wn[e31] = void 0;
      var n3 = Tn[e31];
      n3 && (Tn[e31] = void 0, n3(t4)), Cn.push(e31);
    }
  }
  var Z = {
    toValue: (e31) => (e31 || q(`Cannot use deleted val. handle = ${e31}`), wn[e31]),
    toHandle: (e31) => {
      switch (e31) {
        case void 0:
          return 2;
        case null:
          return 4;
        case true:
          return 6;
        case false:
          return 8;
        default: {
          let t4 = Cn.pop() || wn.length;
          return wn[t4] = e31, wn[t4 + 1] = 1, t4;
        }
      }
    }
  }, Dn = {
    name: "emscripten::val",
    fromWireType: (e31) => {
      var t4 = Z.toValue(e31);
      return En(e31), t4;
    },
    toWireType: (e31, t4) => Z.toHandle(t4),
    readValueFromPointer: Ct,
    destructorFunction: null
  };
  function On(e31) {
    return e31 >>>= 0, jt2(e31, Dn);
  }
  var kn = (e31, t4, n3) => {
    switch (t4) {
      case 1:
        return n3 ? function(e32) {
          return this.fromWireType(b2[e32 >>> 0]);
        } : function(e32) {
          return this.fromWireType(F2[e32 >>> 0]);
        };
      case 2:
        return n3 ? function(e32) {
          return this.fromWireType(W2[e32 >>> 1 >>> 0]);
        } : function(e32) {
          return this.fromWireType(Y[e32 >>> 1 >>> 0]);
        };
      case 4:
        return n3 ? function(e32) {
          return this.fromWireType(z2[e32 >>> 2 >>> 0]);
        } : function(e32) {
          return this.fromWireType(k2[e32 >>> 2 >>> 0]);
        };
      default:
        throw TypeError(`invalid integer width (${t4}): ${e31}`);
    }
  };
  function An(e31) {
    return e31 ? e31 === 1 ? "number" : "string" : "object";
  }
  function jn(e31, n3, r3, i2, a2) {
    e31 >>>= 0, n3 >>>= 0, r3 >>>= 0, n3 = G(n3);
    let o2 = An(a2);
    switch (o2) {
      case "object": {
        let t4 = function() {
        };
        t4.values = {}, jt2(e31, {
          name: n3,
          constructor: t4,
          valueType: o2,
          fromWireType: function(e32) {
            return this.constructor.values[e32];
          },
          toWireType: (e32, t5) => t5.value,
          readValueFromPointer: kn(n3, r3, i2),
          destructorFunction: null
        }), Zt2(n3, t4);
        break;
      }
      case "number":
        var s2 = {};
        jt2(e31, {
          name: n3,
          keysMap: s2,
          valueType: o2,
          fromWireType: (e32) => e32,
          toWireType: (e32, t4) => t4,
          readValueFromPointer: kn(n3, r3, i2),
          destructorFunction: null
        }), Zt2(n3, s2), delete t3[n3].argCount;
        break;
      case "string":
        var c2 = {}, l2 = {}, s2 = {};
        jt2(e31, {
          name: n3,
          valuesMap: c2,
          reverseMap: l2,
          keysMap: s2,
          valueType: o2,
          fromWireType: function(e32) {
            return this.reverseMap[e32];
          },
          toWireType: function(e32, t4) {
            return this.valuesMap[t4];
          },
          readValueFromPointer: kn(n3, r3, i2),
          destructorFunction: null
        }), Zt2(n3, s2), delete t3[n3].argCount;
    }
  }
  var Mn = (e31, t4) => {
    var n3 = Tt[e31];
    return n3 === void 0 && q(`${t4} has unknown type ${bn(e31)}`), n3;
  };
  function Nn(e31, t4, n3) {
    e31 >>>= 0, t4 >>>= 0;
    var r3 = Mn(e31, "enum");
    switch (t4 = G(t4), r3.valueType) {
      case "object":
        var i2 = r3.constructor, a2 = Object.create(r3.constructor.prototype, {
          value: { value: n3 },
          constructor: { value: Jt(`${r3.name}_${t4}`, function() {
          }) }
        });
        i2.values[n3] = a2, i2[t4] = a2;
        break;
      case "number":
        r3.keysMap[t4] = n3;
        break;
      case "string":
        r3.valuesMap[t4] = n3, r3.reverseMap[n3] = t4, r3.keysMap[t4] = t4;
    }
  }
  var Pn, Fn, In = (e31, t4) => {
    switch (t4) {
      case 4:
        return function(e32) {
          return this.fromWireType(Pn[e32 >>> 2 >>> 0]);
        };
      case 8:
        return function(e32) {
          return this.fromWireType(Fn[e32 >>> 3 >>> 0]);
        };
      default:
        throw TypeError(`invalid float width (${t4}): ${e31}`);
    }
  }, Ln = function(e31, t4, n3) {
    e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, t4 = G(t4), jt2(e31, {
      name: t4,
      fromWireType: (e32) => e32,
      toWireType: (e32, t5) => t5,
      readValueFromPointer: In(t4, n3),
      destructorFunction: null
    });
  };
  function Rn(e31) {
    for (var t4 = 1; t4 < e31.length; ++t4) if (e31[t4] !== null && e31[t4].destructorFunction === void 0) return true;
    return false;
  }
  var zn = {
    ftf: function(e31, t4, n3, r3, i2, a2, o2) {
      return function() {
        return a2(n3(r3));
      };
    },
    ftft: function(e31, t4, n3, r3, i2, a2, o2, s2, c2) {
      return function(e32) {
        var t5 = s2(null, e32), i3 = n3(r3, t5);
        return c2(t5), a2(i3);
      };
    },
    ftfn: function(e31, t4, n3, r3, i2, a2, o2, s2) {
      return function(e32) {
        return a2(n3(r3, s2(null, e32)));
      };
    },
    ftfnn: function(e31, t4, n3, r3, i2, a2, o2, s2, c2) {
      return function(e32, t5) {
        return a2(n3(r3, s2(null, e32), c2(null, t5)));
      };
    },
    fffn: function(e31, t4, n3, r3, i2, a2, o2, s2) {
      return function(e32) {
        n3(r3, s2(null, e32));
      };
    },
    ftfnnn: function(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2) {
      return function(e32, t5, i3) {
        return a2(n3(r3, s2(null, e32), c2(null, t5), l2(null, i3)));
      };
    },
    ftfnt: function(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2) {
      return function(e32, t5) {
        var i3 = s2(null, e32), o3 = c2(null, t5), u2 = n3(r3, i3, o3);
        return l2(o3), a2(u2);
      };
    }
  };
  function Bn(e31, t4, n3, r3) {
    let i2 = [
      t4 ? "t" : "f",
      n3 ? "t" : "f",
      r3 ? "t" : "f"
    ];
    for (let n4 = t4 ? 1 : 2; n4 < e31.length; ++n4) {
      let t5 = e31[n4], r4 = "";
      r4 = t5.destructorFunction === void 0 ? "u" : t5.destructorFunction === null ? "n" : "t", i2.push(r4);
    }
    return i2.join("");
  }
  function Vn(e31, t4, n3, r3, i2, a2) {
    var o2 = t4.length;
    o2 < 2 && q("argTypes array size mismatch! Must at least get return value and receiver (this) types!");
    for (var s2 = t4[1] !== null && n3 !== null, c2 = Rn(t4), l2 = !t4[0].isVoid, u2 = t4[0], d2 = t4[1], f2 = [
      e31,
      q,
      r3,
      i2,
      St,
      u2.fromWireType.bind(u2),
      d2?.toWireType.bind(d2)
    ], p3 = 2; p3 < o2; ++p3) {
      var m3 = t4[p3];
      f2.push(m3.toWireType.bind(m3));
    }
    if (!c2) for (var p3 = s2 ? 1 : 2; p3 < t4.length; ++p3) t4[p3].destructorFunction !== null && f2.push(t4[p3].destructorFunction);
    return Jt(e31, zn[Bn(t4, s2, l2, a2)](...f2));
  }
  var Hn = (e31, t4) => {
    for (var n3 = [], r3 = 0; r3 < e31; r3++) n3.push(k2[t4 + r3 * 4 >>> 2 >>> 0]);
    return n3;
  }, Un = (e31) => {
    e31 = e31.trim();
    let t4 = e31.indexOf("(");
    return t4 === -1 ? e31 : e31.slice(0, t4);
  };
  function Wn(e31, t4, n3, r3, i2, a2, o2, s2) {
    e31 >>>= 0, n3 >>>= 0, r3 >>>= 0, i2 >>>= 0, a2 >>>= 0;
    var c2 = Hn(t4, n3);
    e31 = G(e31), e31 = Un(e31), i2 = X(r3, i2, o2), Zt2(e31, function() {
      xn(`Cannot call ${e31} due to unbound types`, c2);
    }, t4 - 1), kt([], c2, (n4) => {
      var r4 = [n4[0], null].concat(n4.slice(1));
      return gn(e31, Vn(e31, r4, null, i2, a2, o2), t4 - 1), [];
    });
  }
  var Gn = function(e31, t4, n3, r3, i2) {
    e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, t4 = G(t4);
    let a2 = r3 === 0, o2 = (e32) => e32;
    if (a2) {
      var s2 = 32 - 8 * n3;
      o2 = (e32) => e32 << s2 >>> s2, i2 = o2(i2);
    }
    jt2(e31, {
      name: t4,
      fromWireType: o2,
      toWireType: (e32, t5) => t5,
      readValueFromPointer: Nt(t4, n3, r3 !== 0),
      destructorFunction: null
    });
  };
  function Kn(e31, t4, n3) {
    e31 >>>= 0, n3 >>>= 0;
    var r3 = [
      Int8Array,
      Uint8Array,
      Int16Array,
      Uint16Array,
      Int32Array,
      Uint32Array,
      Float32Array,
      Float64Array,
      BigInt64Array,
      BigUint64Array
    ][t4];
    function i2(e32) {
      var t5 = k2[e32 >>> 2 >>> 0], n4 = k2[e32 + 4 >>> 2 >>> 0];
      return new r3(b2.buffer, n4, t5);
    }
    n3 = G(n3), jt2(e31, {
      name: n3,
      fromWireType: i2,
      readValueFromPointer: i2
    }, { ignoreDuplicateRegistrations: true });
  }
  function qn(e31, t4) {
    e31 >>>= 0, t4 >>>= 0, t4 = G(t4);
    var n3 = true;
    jt2(e31, {
      name: t4,
      fromWireType(e32) {
        var t5 = k2[e32 >>> 2 >>> 0], r3 = e32 + 4, i2;
        if (n3) i2 = $e(r3, t5, true);
        else {
          i2 = "";
          for (var a2 = 0; a2 < t5; ++a2) i2 += String.fromCharCode(F2[r3 + a2 >>> 0]);
        }
        return Q(e32), i2;
      },
      toWireType(e32, t5) {
        t5 instanceof ArrayBuffer && (t5 = new Uint8Array(t5));
        var r3, i2 = typeof t5 == "string";
        i2 || ArrayBuffer.isView(t5) && t5.BYTES_PER_ELEMENT == 1 || q("Cannot pass non-string to std::string"), r3 = n3 && i2 ? je2(t5) : t5.length;
        var a2 = bi(4 + r3 + 1), o2 = a2 + 4;
        if (k2[a2 >>> 2 >>> 0] = r3, i2) {
          if (n3) st(t5, o2, r3 + 1);
          else for (var s2 = 0; s2 < r3; ++s2) {
            var c2 = t5.charCodeAt(s2);
            c2 > 255 && (Q(a2), q("String has UTF-16 code units that do not fit in 8 bits")), F2[o2 + s2 >>> 0] = c2;
          }
        } else F2.set(t5, o2 >>> 0);
        return e32 !== null && e32.push(Q, a2), a2;
      },
      readValueFromPointer: Ct,
      destructorFunction(e32) {
        Q(e32);
      }
    });
  }
  var Jn = globalThis.TextDecoder ? new TextDecoder("utf-16le") : void 0, Yn = (e31, t4, n3) => {
    var r3 = e31 >>> 1, i2 = Oe2(Y, r3, t4 / 2, n3);
    if (i2 - r3 > 16 && Jn) return Jn.decode(Y.subarray(r3 >>> 0, i2 >>> 0));
    for (var a2 = "", o2 = r3; o2 < i2; ++o2) {
      var s2 = Y[o2 >>> 0];
      a2 += String.fromCharCode(s2);
    }
    return a2;
  }, Xn = (e31, t4, n3 = 2147483647) => {
    if (n3 < 2) return 0;
    n3 -= 2;
    for (var r3 = t4, i2 = n3 < e31.length * 2 ? n3 / 2 : e31.length, a2 = 0; a2 < i2; ++a2) {
      var o2 = e31.charCodeAt(a2);
      W2[t4 >>> 1 >>> 0] = o2, t4 += 2;
    }
    return W2[t4 >>> 1 >>> 0] = 0, t4 - r3;
  }, Zn = (e31) => e31.length * 2, Qn = (e31, t4, n3) => {
    for (var r3 = "", i2 = e31 >>> 2, a2 = 0; !(a2 >= t4 / 4); a2++) {
      var o2 = k2[i2 + a2 >>> 0];
      if (!o2 && !n3) break;
      r3 += String.fromCodePoint(o2);
    }
    return r3;
  }, $n = (e31, t4, n3 = 2147483647) => {
    if (t4 >>>= 0, n3 < 4) return 0;
    for (var r3 = t4, i2 = r3 + n3 - 4, a2 = 0; a2 < e31.length; ++a2) {
      var o2 = e31.codePointAt(a2);
      if (o2 > 65535 && a2++, z2[t4 >>> 2 >>> 0] = o2, t4 += 4, t4 + 4 > i2) break;
    }
    return z2[t4 >>> 2 >>> 0] = 0, t4 - r3;
  }, er = (e31) => {
    for (var t4 = 0, n3 = 0; n3 < e31.length; ++n3) e31.codePointAt(n3) > 65535 && n3++, t4 += 4;
    return t4;
  };
  function tr(e31, t4, n3) {
    e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, n3 = G(n3);
    var r3, i2, a2;
    t4 === 2 ? (r3 = Yn, i2 = Xn, a2 = Zn) : (r3 = Qn, i2 = $n, a2 = er), jt2(e31, {
      name: n3,
      fromWireType: (e32) => {
        var n4 = k2[e32 >>> 2 >>> 0], i3 = r3(e32 + 4, n4 * t4, true);
        return Q(e32), i3;
      },
      toWireType: (e32, r4) => {
        typeof r4 != "string" && q(`Cannot pass non-string to C++ string type ${n3}`);
        var o2 = a2(r4), s2 = bi(4 + o2 + t4);
        return k2[s2 >>> 2 >>> 0] = o2 / t4, i2(r4, s2 + 4, o2 + t4), e32 !== null && e32.push(Q, s2), s2;
      },
      readValueFromPointer: Ct,
      destructorFunction(e32) {
        Q(e32);
      }
    });
  }
  function nr(e31, t4, n3, r3, i2, a2) {
    e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, r3 >>>= 0, i2 >>>= 0, a2 >>>= 0, xt[e31] = {
      name: G(t4),
      rawConstructor: X(n3, r3),
      rawDestructor: X(i2, a2),
      fields: []
    };
  }
  function rr(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2) {
    e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, r3 >>>= 0, i2 >>>= 0, a2 >>>= 0, o2 >>>= 0, s2 >>>= 0, c2 >>>= 0, l2 >>>= 0, xt[e31].fields.push({
      fieldName: G(t4),
      getterReturnType: n3,
      getter: X(r3, i2),
      getterContext: a2,
      setterArgumentType: o2,
      setter: X(s2, c2),
      setterContext: l2
    });
  }
  var ir = function(e31, t4) {
    e31 >>>= 0, t4 >>>= 0, t4 = G(t4), jt2(e31, {
      isVoid: true,
      name: t4,
      fromWireType: () => void 0,
      toWireType: (e32, t5) => void 0
    });
  }, ar = () => {
  };
  function or(e31) {
    return e31 >>>= 0, e31 ? -52 : 0;
  }
  var sr = () => {
    throw new ee2();
  }, cr = [], lr = (e31) => {
    var t4 = cr.length;
    return cr.push(e31), t4;
  }, ur = (e31, t4) => {
    for (var n3 = Array(e31), r3 = 0; r3 < e31; ++r3) n3[r3] = Mn(k2[t4 + r3 * 4 >>> 2 >>> 0], `parameter ${r3}`);
    return n3;
  }, dr = (e31, t4, n3) => {
    var r3 = [], i2 = e31(r3, n3);
    return r3.length && (k2[t4 >>> 2 >>> 0] = Z.toHandle(r3)), i2;
  }, fr = {}, pr = (e31) => {
    var t4 = fr[e31];
    return t4 === void 0 ? G(e31) : t4;
  }, mr = function(e31, t4, n3) {
    t4 >>>= 0;
    var r3 = 8, [i2, ...a2] = ur(e31, t4), o2 = i2.toWireType.bind(i2), s2 = a2.map((e32) => e32.readValueFromPointer.bind(e32));
    e31--;
    var c2 = Array(e31);
    return lr(Jt(`methodCaller<(${a2.map((e32) => e32.name)}) => ${i2.name}>`, (t5, i3, a3, l2) => {
      for (var u2 = 0, d2 = 0; d2 < e31; ++d2) c2[d2] = s2[d2](l2 + u2), u2 += r3;
      var f2;
      switch (n3) {
        case 0:
          f2 = Z.toValue(t5).apply(null, c2);
          break;
        case 2:
          f2 = Reflect.construct(Z.toValue(t5), c2);
          break;
        case 3:
          f2 = c2[0];
          break;
        case 1:
          f2 = Z.toValue(t5)[pr(i3)](...c2);
      }
      return dr(o2, a3, f2);
    }));
  };
  function hr(e31) {
    e31 >>>= 0, e31 > 9 && (wn[e31 + 1] += 1);
  }
  function gr(e31, t4, n3, r3, i2) {
    return e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, r3 >>>= 0, i2 >>>= 0, cr[e31](t4, n3, r3, i2);
  }
  function _r() {
    return Z.toHandle([]);
  }
  function vr(e31) {
    return e31 >>>= 0, Z.toHandle(pr(e31));
  }
  function yr() {
    return Z.toHandle({});
  }
  function br(e31) {
    e31 >>>= 0, St(Z.toValue(e31)), En(e31);
  }
  function xr(e31, t4, n3) {
    e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, e31 = Z.toValue(e31), t4 = Z.toValue(t4), n3 = Z.toValue(n3), e31[t4] = n3;
  }
  function Sr(e31, t4) {
    e31 = C2(e31), t4 >>>= 0;
    var n3 = /* @__PURE__ */ new Date(e31 * 1e3);
    if (isNaN(n3.getTime())) return 1;
    z2[t4 >>> 2 >>> 0] = n3.getUTCSeconds(), z2[t4 + 4 >>> 2 >>> 0] = n3.getUTCMinutes(), z2[t4 + 8 >>> 2 >>> 0] = n3.getUTCHours(), z2[t4 + 12 >>> 2 >>> 0] = n3.getUTCDate(), z2[t4 + 16 >>> 2 >>> 0] = n3.getUTCMonth(), z2[t4 + 20 >>> 2 >>> 0] = n3.getUTCFullYear() - 1900, z2[t4 + 24 >>> 2 >>> 0] = n3.getUTCDay();
    var r3 = Date.UTC(n3.getUTCFullYear(), 0, 1, 0, 0, 0, 0), i2 = (n3.getTime() - r3) / 864e5 | 0;
    return z2[t4 + 28 >>> 2 >>> 0] = i2, 0;
  }
  var Cr = (e31) => e31 % 4 == 0 && (e31 % 100 != 0 || e31 % 400 == 0), wr = [
    0,
    31,
    60,
    91,
    121,
    152,
    182,
    213,
    244,
    274,
    305,
    335
  ], Tr = [
    0,
    31,
    59,
    90,
    120,
    151,
    181,
    212,
    243,
    273,
    304,
    334
  ], Er = (e31) => (Cr(e31.getFullYear()) ? wr : Tr)[e31.getMonth()] + e31.getDate() - 1;
  function Dr(e31, t4) {
    e31 = C2(e31), t4 >>>= 0;
    var n3 = /* @__PURE__ */ new Date(e31 * 1e3);
    if (isNaN(n3.getTime())) return 1;
    z2[t4 >>> 2 >>> 0] = n3.getSeconds(), z2[t4 + 4 >>> 2 >>> 0] = n3.getMinutes(), z2[t4 + 8 >>> 2 >>> 0] = n3.getHours(), z2[t4 + 12 >>> 2 >>> 0] = n3.getDate(), z2[t4 + 16 >>> 2 >>> 0] = n3.getMonth(), z2[t4 + 20 >>> 2 >>> 0] = n3.getFullYear() - 1900, z2[t4 + 24 >>> 2 >>> 0] = n3.getDay();
    var r3 = Er(n3) | 0;
    z2[t4 + 28 >>> 2 >>> 0] = r3, z2[t4 + 36 >>> 2 >>> 0] = -(n3.getTimezoneOffset() * 60);
    var i2 = new Date(n3.getFullYear(), 0, 1), a2 = new Date(n3.getFullYear(), 6, 1).getTimezoneOffset(), o2 = i2.getTimezoneOffset(), s2 = (a2 != o2 && n3.getTimezoneOffset() == Math.min(o2, a2)) | 0;
    return z2[t4 + 32 >>> 2 >>> 0] = s2, 0;
  }
  var Or = function(e31) {
    e31 >>>= 0;
    var t4 = (() => {
      var t5 = new Date(z2[e31 + 20 >>> 2 >>> 0] + 1900, z2[e31 + 16 >>> 2 >>> 0], z2[e31 + 12 >>> 2 >>> 0], z2[e31 + 8 >>> 2 >>> 0], z2[e31 + 4 >>> 2 >>> 0], z2[e31 >>> 2 >>> 0], 0);
      if (isNaN(t5.getTime())) return -1;
      var n3 = z2[e31 + 32 >>> 2 >>> 0], r3 = t5.getTimezoneOffset(), i2 = new Date(t5.getFullYear(), 0, 1), a2 = new Date(t5.getFullYear(), 6, 1).getTimezoneOffset(), o2 = i2.getTimezoneOffset(), s2 = Math.min(o2, a2);
      if (n3 < 0) n3 = Number(a2 != o2 && s2 == r3);
      else if (n3 > 0 != (s2 == r3)) {
        var c2 = n3 > 0 ? s2 : Math.max(o2, a2);
        if (t5.setTime(t5.getTime() + (c2 - r3) * 6e4), isNaN(t5.getTime())) return -1;
      }
      z2[e31 + 32 >>> 2 >>> 0] = n3, z2[e31 + 24 >>> 2 >>> 0] = t5.getDay();
      var l2 = Er(t5) | 0;
      return z2[e31 + 28 >>> 2 >>> 0] = l2, z2[e31 >>> 2 >>> 0] = t5.getSeconds(), z2[e31 + 4 >>> 2 >>> 0] = t5.getMinutes(), z2[e31 + 8 >>> 2 >>> 0] = t5.getHours(), z2[e31 + 12 >>> 2 >>> 0] = t5.getDate(), z2[e31 + 16 >>> 2 >>> 0] = t5.getMonth(), z2[e31 + 20 >>> 2 >>> 0] = t5.getYear(), t5.getTime() / 1e3;
    })();
    return BigInt(t4);
  };
  function kr(e31, t4, n3, r3, i2, a2, o2) {
    e31 >>>= 0, i2 = C2(i2), a2 >>>= 0, o2 >>>= 0;
    try {
      var s2 = V2.getStreamFromFD(r3), c2 = R2.mmap(s2, e31, i2, t4, n3), l2 = c2.ptr;
      return z2[a2 >>> 2 >>> 0] = c2.allocated, k2[o2 >>> 2 >>> 0] = l2, 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  function Ar(e31, t4, n3, r3, i2, a2) {
    e31 >>>= 0, t4 >>>= 0, a2 = C2(a2);
    try {
      var o2 = V2.getStreamFromFD(i2);
      n3 & 2 && V2.doMsync(e31, o2, t4, r3, a2);
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return -e32.errno;
    }
  }
  var jr = function(e31, t4, n3, r3) {
    e31 >>>= 0, t4 >>>= 0, n3 >>>= 0, r3 >>>= 0;
    var i2 = (/* @__PURE__ */ new Date()).getFullYear(), a2 = new Date(i2, 0, 1), o2 = new Date(i2, 6, 1), s2 = a2.getTimezoneOffset(), c2 = o2.getTimezoneOffset(), l2 = Math.max(s2, c2);
    k2[e31 >>> 2 >>> 0] = l2 * 60, z2[t4 >>> 2 >>> 0] = Number(s2 != c2);
    var u2 = (e32) => {
      var t5 = e32 >= 0 ? "-" : "+", n4 = Math.abs(e32);
      return `UTC${t5}${String(Math.floor(n4 / 60)).padStart(2, "0")}${String(n4 % 60).padStart(2, "0")}`;
    }, d2 = u2(s2), f2 = u2(c2);
    c2 < s2 ? (st(d2, n3, 17), st(f2, r3, 17)) : (st(d2, r3, 17), st(f2, n3, 17));
  }, Mr = () => performance.now(), Nr = () => Date.now(), Pr = 1, Fr = (e31) => e31 >= 0 && e31 <= 3;
  function Ir(e31, t4, n3) {
    if (t4 = C2(t4), n3 >>>= 0, !Fr(e31)) return 28;
    var r3;
    if (e31 === 0) r3 = Nr();
    else if (Pr) r3 = Mr();
    else return 52;
    var i2 = Math.round(r3 * 1e3 * 1e3);
    return B2[n3 >>> 3 >>> 0] = BigInt(i2), 0;
  }
  var Lr = () => 4294901760;
  function Rr() {
    return Lr();
  }
  var zr = (e31) => {
    var t4 = (e31 - ki.buffer.byteLength + 65535) / 65536 | 0;
    try {
      return ki.grow(t4), ne2(), 1;
    } catch {
    }
  };
  function Br(e31) {
    e31 >>>= 0;
    var t4 = F2.length, n3 = Lr();
    if (e31 > n3) return false;
    for (var r3 = 1; r3 <= 4; r3 *= 2) {
      var i2 = t4 * (1 + 0.2 / r3);
      if (i2 = Math.min(i2, e31 + 100663296), zr(Math.min(n3, Ie2(Math.max(e31, i2), 65536)))) return true;
    }
    return false;
  }
  var Vr = {}, Hr = () => i, Ur = () => {
    if (!Ur.strings) {
      var e31 = {
        USER: "web_user",
        LOGNAME: "web_user",
        PATH: "/",
        PWD: "/",
        HOME: "/home/web_user",
        LANG: (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8",
        _: Hr()
      };
      for (var t4 in Vr) Vr[t4] === void 0 ? delete e31[t4] : e31[t4] = Vr[t4];
      var n3 = [];
      for (var t4 in e31) n3.push(`${t4}=${e31[t4]}`);
      Ur.strings = n3;
    }
    return Ur.strings;
  };
  function Wr(e31, t4) {
    e31 >>>= 0, t4 >>>= 0;
    var n3 = 0, r3 = 0;
    for (var i2 of Ur()) {
      var a2 = t4 + n3;
      k2[e31 + r3 >>> 2 >>> 0] = a2, n3 += st(i2, a2, Infinity) + 1, r3 += 4;
    }
    return 0;
  }
  function Gr(e31, t4) {
    e31 >>>= 0, t4 >>>= 0;
    var n3 = Ur();
    k2[e31 >>> 2 >>> 0] = n3.length;
    var r3 = 0;
    for (var i2 of n3) r3 += je2(i2) + 1;
    return k2[t4 >>> 2 >>> 0] = r3, 0;
  }
  var Kr = () => true, qr = (e31) => {
    Kr() || (m2 = true), a(e31, new de2(e31));
  }, Jr = (e31, t4) => {
    qr(e31);
  };
  function Yr(e31) {
    try {
      var t4 = V2.getStreamFromFD(e31);
      return R2.close(t4), 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return e32.errno;
    }
  }
  function Xr(e31, t4) {
    t4 >>>= 0;
    try {
      var n3 = 0, r3 = 0, i2 = 0, a2 = V2.getStreamFromFD(e31), o2 = a2.tty ? 2 : R2.isDir(a2.mode) ? 3 : R2.isLink(a2.mode) ? 7 : 4;
      return b2[t4 >>> 0] = o2, W2[t4 + 2 >>> 1 >>> 0] = i2, B2[t4 + 8 >>> 3 >>> 0] = BigInt(n3), B2[t4 + 16 >>> 3 >>> 0] = BigInt(r3), 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return e32.errno;
    }
  }
  var Zr = (e31, t4, n3, r3) => {
    for (var i2 = 0, a2 = 0; a2 < n3; a2++) {
      var o2 = k2[t4 >>> 2 >>> 0], s2 = k2[t4 + 4 >>> 2 >>> 0];
      t4 += 8;
      try {
        var c2 = R2.read(e31, b2, o2, s2, r3);
      } catch (e32) {
        if (i2 > 0 && e32 instanceof R2.ErrnoError && (e32.errno == 6 || e32.errno == 6)) break;
        throw e32;
      }
      if (c2 < 0) return -1;
      if (i2 += c2, c2 < s2) break;
      r3 !== void 0 && (r3 += c2);
    }
    return i2;
  };
  function Qr(e31, t4, n3, r3, i2) {
    t4 >>>= 0, n3 >>>= 0, r3 = C2(r3), i2 >>>= 0;
    try {
      if (isNaN(r3)) return 22;
      var a2 = Zr(V2.getStreamFromFD(e31), t4, n3, r3);
      return k2[i2 >>> 2 >>> 0] = a2, 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return e32.errno;
    }
  }
  function $r(e31, t4, n3, r3) {
    t4 >>>= 0, n3 >>>= 0, r3 >>>= 0;
    try {
      var i2 = Zr(V2.getStreamFromFD(e31), t4, n3);
      return k2[r3 >>> 2 >>> 0] = i2, 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return e32.errno;
    }
  }
  function ei(e31, t4, n3, r3) {
    t4 = C2(t4), r3 >>>= 0;
    try {
      if (isNaN(t4)) return 22;
      var i2 = V2.getStreamFromFD(e31);
      return R2.llseek(i2, t4, n3), B2[r3 >>> 3 >>> 0] = BigInt(i2.position), i2.getdents && !t4 && n3 === 0 && (i2.getdents = null), 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return e32.errno;
    }
  }
  function ti(e31) {
    try {
      var t4 = V2.getStreamFromFD(e31);
      return t4.stream_ops?.fsync?.(t4);
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return e32.errno;
    }
  }
  var ni = (e31, t4, n3, r3) => {
    if (n3 == 1) return R2.write(e31, b2, k2[t4 >>> 2 >>> 0], k2[t4 + 4 >>> 2 >>> 0], r3);
    for (var i2 = 0, a2 = 0, o2 = t4; a2 < n3; a2++, o2 += 8) i2 += k2[o2 + 4 >>> 2 >>> 0];
    for (var s2 = new Uint8Array(i2), c2 = 0, a2 = 0; a2 < n3; a2++, t4 += 8) {
      var l2 = k2[t4 >>> 2 >>> 0], u2 = k2[t4 + 4 >>> 2 >>> 0];
      s2.set(F2.subarray(l2 >>> 0, l2 + u2 >>> 0), c2), c2 += u2;
    }
    return R2.write(e31, s2, 0, i2, r3);
  };
  function ri(e31, t4, n3, r3) {
    t4 >>>= 0, n3 >>>= 0, r3 >>>= 0;
    try {
      var i2 = ni(V2.getStreamFromFD(e31), t4, n3);
      return k2[r3 >>> 2 >>> 0] = i2, 0;
    } catch (e32) {
      if (R2 === void 0 || e32.name !== "ErrnoError") throw e32;
      return e32.errno;
    }
  }
  function ii(e31) {
    return e31 >>>= 0, e31;
  }
  function ai(e31, t4) {
    return e31 >>>= 0, t4 >>>= 0, Ee2(F2.subarray(e31 >>> 0, e31 + t4 >>> 0));
  }
  var oi = (e31, t4) => {
    if (si) for (var n3 = e31; n3 < e31 + t4; n3++) {
      var r3 = T2(n3);
      r3 && si.set(r3, n3);
    }
  }, si, ci = (e31) => (si || (si = /* @__PURE__ */ new WeakMap(), oi(0, Ai.length)), si.get(e31) || 0), li = [], ui = () => li.length ? li.pop() : Ai.grow(1), di = (e31, t4) => {
    Ai.set(e31, t4), w2[e31] = Ai.get(e31);
  }, fi = (e31) => {
    let t4 = e31.length;
    return [
      t4 % 128 | 128,
      t4 >> 7,
      ...e31
    ];
  }, pi = {
    i: 127,
    p: 127,
    j: 126,
    f: 125,
    d: 124,
    e: 111
  }, mi = (e31) => fi(Array.from(e31, (e32) => pi[e32])), hi = (e31, t4) => {
    var n3 = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, ...fi([
      1,
      96,
      ...mi(t4.slice(1)),
      ...mi(t4[0] === "v" ? "" : t4[0])
    ]), 2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0), r3 = new WebAssembly.Module(n3);
    return new WebAssembly.Instance(r3, { e: { f: e31 } }).exports.f;
  }, gi = (e31, t4) => {
    var n3 = ci(e31);
    if (n3) return n3;
    var r3 = ui();
    try {
      di(r3, e31);
    } catch (n4) {
      if (!(n4 instanceof TypeError)) throw n4;
      di(r3, hi(e31, t4));
    }
    return si.set(e31, r3), r3;
  };
  function _i(e31, t4 = "i8") {
    switch (t4.endsWith("*") && (t4 = "*"), t4) {
      case "i1":
        return b2[e31 >>> 0];
      case "i8":
        return b2[e31 >>> 0];
      case "i16":
        return W2[e31 >>> 1 >>> 0];
      case "i32":
        return z2[e31 >>> 2 >>> 0];
      case "i64":
        return B2[e31 >>> 3 >>> 0];
      case "float":
        return Pn[e31 >>> 2 >>> 0];
      case "double":
        return Fn[e31 >>> 3 >>> 0];
      case "*":
        return k2[e31 >>> 2 >>> 0];
      default:
        v2(`invalid type for getValue: ${t4}`);
    }
  }
  function vi(e31, t4, n3 = "i8") {
    switch (n3.endsWith("*") && (n3 = "*"), n3) {
      case "i1":
        b2[e31 >>> 0] = t4;
        break;
      case "i8":
        b2[e31 >>> 0] = t4;
        break;
      case "i16":
        W2[e31 >>> 1 >>> 0] = t4;
        break;
      case "i32":
        z2[e31 >>> 2 >>> 0] = t4;
        break;
      case "i64":
        B2[e31 >>> 3 >>> 0] = BigInt(t4);
        break;
      case "float":
        Pn[e31 >>> 2 >>> 0] = t4;
        break;
      case "double":
        Fn[e31 >>> 3 >>> 0] = t4;
        break;
      case "*":
        k2[e31 >>> 2 >>> 0] = t4;
        break;
      default:
        v2(`invalid type for setValue: ${n3}`);
    }
  }
  R2.createPreloadedFile = Qe2, R2.preloadFile = Ze2, R2.staticInit(), Kt(), mn(), t3.wasmBinary && (p2 = t3.wasmBinary), t3.addFunction = gi, t3.setValue = vi, t3.getValue = _i, t3.UTF8ToString = $e, t3.stringToUTF8 = st, t3.lengthBytesUTF8 = je2, t3.FS = R2;
  var yi, bi, Q, xi, $, Si, Ci, wi, Ti, Ei, Di, Oi, ki, Ai;
  function ji(e31) {
    yi = e31.rb, t3._MagickColor_Create = e31.sb, t3._MagickColor_Dispose = e31.tb, t3._MagickColor_Count_Get = e31.ub, t3._MagickColor_Red_Get = e31.vb, t3._MagickColor_Red_Set = e31.wb, t3._MagickColor_Green_Get = e31.xb, t3._MagickColor_Green_Set = e31.yb, t3._MagickColor_Blue_Get = e31.zb, t3._MagickColor_Blue_Set = e31.Ab, t3._MagickColor_Alpha_Get = e31.Bb, t3._MagickColor_Alpha_Set = e31.Cb, t3._MagickColor_Black_Get = e31.Db, t3._MagickColor_Black_Set = e31.Eb, t3._MagickColor_IsCMYK_Get = e31.Fb, t3._MagickColor_IsCMYK_Set = e31.Gb, t3._MagickColor_Clone = e31.Hb, t3._MagickColor_FuzzyEquals = e31.Ib, t3._MagickColor_Initialize = e31.Jb, t3._MagickColorCollection_Create = e31.Lb, t3._MagickColorCollection_Dispose = e31.Mb, t3._MagickColorCollection_Get = e31.Nb, t3._MagickColorCollection_Set = e31.Ob, t3._DrawingWand_Create = e31.Pb, t3._DrawingWand_Dispose = e31.Qb, t3._DrawingWand_Affine = e31.Rb, t3._DrawingWand_Alpha = e31.Sb, t3._DrawingWand_Arc = e31.Tb, t3._DrawingWand_Bezier = e31.Ub, t3._DrawingWand_BorderColor = e31.Vb, t3._DrawingWand_Circle = e31.Wb, t3._DrawingWand_ClipPath = e31.Xb, t3._DrawingWand_ClipRule = e31.Yb, t3._DrawingWand_ClipUnits = e31.Zb, t3._DrawingWand_Color = e31._b, t3._DrawingWand_Composite = e31.$b, t3._DrawingWand_Density = e31.ac, t3._DrawingWand_Ellipse = e31.bc, t3._DrawingWand_FillColor = e31.cc, t3._DrawingWand_FillOpacity = e31.dc, t3._DrawingWand_FillPatternUrl = e31.ec, t3._DrawingWand_FillRule = e31.fc, t3._DrawingWand_Font = e31.gc, t3._DrawingWand_FontFamily = e31.hc, t3._DrawingWand_FontPointSize = e31.ic, t3._DrawingWand_FontTypeMetrics = e31.jc, t3._TypeMetric_Create = e31.kc, t3._DrawingWand_Gravity = e31.lc, t3._DrawingWand_Line = e31.mc, t3._DrawingWand_PathArcAbs = e31.nc, t3._DrawingWand_PathArcRel = e31.oc, t3._DrawingWand_PathClose = e31.pc, t3._DrawingWand_PathCurveToAbs = e31.qc, t3._DrawingWand_PathCurveToRel = e31.rc, t3._DrawingWand_PathFinish = e31.sc, t3._DrawingWand_PathLineToAbs = e31.tc, t3._DrawingWand_PathLineToHorizontalAbs = e31.uc, t3._DrawingWand_PathLineToHorizontalRel = e31.vc, t3._DrawingWand_PathLineToRel = e31.wc, t3._DrawingWand_PathLineToVerticalAbs = e31.xc, t3._DrawingWand_PathLineToVerticalRel = e31.yc, t3._DrawingWand_PathMoveToAbs = e31.zc, t3._DrawingWand_PathMoveToRel = e31.Ac, t3._DrawingWand_PathQuadraticCurveToAbs = e31.Bc, t3._DrawingWand_PathQuadraticCurveToRel = e31.Cc, t3._DrawingWand_PathSmoothCurveToAbs = e31.Dc, t3._DrawingWand_PathSmoothCurveToRel = e31.Ec, t3._DrawingWand_PathSmoothQuadraticCurveToAbs = e31.Fc, t3._DrawingWand_PathSmoothQuadraticCurveToRel = e31.Gc, t3._DrawingWand_PathStart = e31.Hc, t3._DrawingWand_Point = e31.Ic, t3._DrawingWand_Polygon = e31.Jc, t3._DrawingWand_Polyline = e31.Kc, t3._DrawingWand_PopClipPath = e31.Lc, t3._DrawingWand_PopGraphicContext = e31.Mc, t3._DrawingWand_PopPattern = e31.Nc, t3._DrawingWand_PushClipPath = e31.Oc, t3._DrawingWand_PushGraphicContext = e31.Pc, t3._DrawingWand_PushPattern = e31.Qc, t3._DrawingWand_Rectangle = e31.Rc, t3._DrawingWand_Render = e31.Sc, t3._DrawingWand_Rotation = e31.Tc, t3._DrawingWand_RoundRectangle = e31.Uc, t3._DrawingWand_Scaling = e31.Vc, t3._DrawingWand_SkewX = e31.Wc, t3._DrawingWand_SkewY = e31.Xc, t3._DrawingWand_StrokeAntialias = e31.Yc, t3._DrawingWand_StrokeColor = e31.Zc, t3._DrawingWand_StrokeDashArray = e31._c, t3._DrawingWand_StrokeDashOffset = e31.$c, t3._DrawingWand_StrokeLineCap = e31.ad, t3._DrawingWand_StrokeLineJoin = e31.bd, t3._DrawingWand_StrokeMiterLimit = e31.cd, t3._DrawingWand_StrokeOpacity = e31.dd, t3._DrawingWand_StrokePatternUrl = e31.ed, t3._DrawingWand_StrokeWidth = e31.fd, t3._DrawingWand_Text = e31.gd, t3._DrawingWand_TextAlignment = e31.hd, t3._DrawingWand_TextAntialias = e31.id, t3._DrawingWand_TextDecoration = e31.jd, t3._DrawingWand_TextDirection = e31.kd, t3._DrawingWand_TextEncoding = e31.ld, t3._DrawingWand_TextInterlineSpacing = e31.md, t3._DrawingWand_TextInterwordSpacing = e31.nd, t3._DrawingWand_TextKerning = e31.od, t3._DrawingWand_TextUnderColor = e31.pd, t3._DrawingWand_Translation = e31.qd, t3._DrawingWand_Viewbox = e31.rd, t3._MagickExceptionHelper_Description = e31.sd, t3._MagickExceptionHelper_Dispose = e31.td, t3._MagickExceptionHelper_Related = e31.ud, t3._MagickExceptionHelper_RelatedCount = e31.vd, t3._MagickExceptionHelper_Message = e31.wd, t3._MagickExceptionHelper_Severity = e31.xd, t3._PdfInfo_PageCount = e31.yd, t3._Environment_Initialize = e31.zd, t3._Environment_GetEnv = e31.Ad, t3._Environment_SetEnv = e31.Bd, t3._MagickMemory_Relinquish = e31.Cd, t3._Magick_Delegates_Get = e31.Dd, t3._Magick_Features_Get = e31.Ed, t3._Magick_ImageMagickVersion_Get = e31.Fd, t3._Magick_GetFonts = e31.Gd, t3._Magick_GetFontFamily = e31.Hd, t3._Magick_GetFontName = e31.Id, t3._Magick_GetWindowsResource = e31.Jd, t3._Magick_DisposeFonts = e31.Kd, t3._Magick_ResetRandomSeed = e31.Ld, t3._Magick_SetDefaultFontFile = e31.Md, t3._Magick_SetRandomSeed = e31.Nd, t3._Magick_SetLogDelegate = e31.Od, t3._Magick_SetLogEvents = e31.Pd, t3._MagickFormatInfo_CreateList = e31.Qd, t3._MagickFormatInfo_DisposeList = e31.Rd, t3._MagickFormatInfo_CanReadMultithreaded_Get = e31.Sd, t3._MagickFormatInfo_CanWriteMultithreaded_Get = e31.Td, t3._MagickFormatInfo_Description_Get = e31.Ud, t3._MagickFormatInfo_Format_Get = e31.Vd, t3._MagickFormatInfo_MimeType_Get = e31.Wd, t3._MagickFormatInfo_Module_Get = e31.Xd, t3._MagickFormatInfo_SupportsMultipleFrames_Get = e31.Yd, t3._MagickFormatInfo_SupportsReading_Get = e31.Zd, t3._MagickFormatInfo_SupportsWriting_Get = e31._d, t3._MagickFormatInfo_Version_Get = e31.$d, t3._MagickFormatInfo_GetInfo = e31.ae, t3._MagickFormatInfo_GetInfoByName = e31.be, t3._MagickFormatInfo_GetInfoWithBlob = e31.ce, t3._MagickFormatInfo_Unregister = e31.de, t3._MagickImage_Create = e31.ee, t3._MagickImage_Dispose = e31.fe, t3._MagickImage_AnimationDelay_Get = e31.ge, t3._MagickImage_AnimationDelay_Set = e31.he, t3._MagickImage_AnimationIterations_Get = e31.ie, t3._MagickImage_AnimationIterations_Set = e31.je, t3._MagickImage_AnimationTicksPerSecond_Get = e31.ke, t3._MagickImage_AnimationTicksPerSecond_Set = e31.le, t3._MagickImage_BackgroundColor_Get = e31.me, t3._MagickImage_BackgroundColor_Set = e31.ne, t3._MagickImage_BaseHeight_Get = e31.oe, t3._MagickImage_BaseWidth_Get = e31.pe, t3._MagickImage_BlackPointCompensation_Get = e31.qe, t3._MagickImage_BlackPointCompensation_Set = e31.re, t3._MagickImage_BorderColor_Get = e31.se, t3._MagickImage_BorderColor_Set = e31.te, t3._MagickImage_BoundingBox_Get = e31.ue, t3._MagickRectangle_Create = e31.ve, t3._MagickImage_ChannelCount_Get = e31.we, t3._MagickImage_ChromaBlue_Get = e31.xe, t3._PrimaryInfo_Create = e31.ye, t3._MagickImage_ChromaBlue_Set = e31.ze, t3._MagickImage_ChromaGreen_Get = e31.Ae, t3._MagickImage_ChromaGreen_Set = e31.Be, t3._MagickImage_ChromaRed_Get = e31.Ce, t3._MagickImage_ChromaRed_Set = e31.De, t3._MagickImage_ChromaWhite_Get = e31.Ee, t3._MagickImage_ChromaWhite_Set = e31.Fe, t3._MagickImage_ClassType_Get = e31.Ge, t3._MagickImage_ClassType_Set = e31.He, t3._QuantizeSettings_Create = e31.Ie, t3._QuantizeSettings_Dispose = e31.Je, t3._MagickImage_ColorFuzz_Get = e31.Ke, t3._MagickImage_ColorFuzz_Set = e31.Le, t3._MagickImage_ColormapSize_Get = e31.Me, t3._MagickImage_ColormapSize_Set = e31.Ne, t3._MagickImage_ColorSpace_Get = e31.Oe, t3._MagickImage_ColorSpace_Set = e31.Pe, t3._MagickImage_ColorType_Get = e31.Qe, t3._MagickImage_ColorType_Set = e31.Re, t3._MagickImage_Compose_Get = e31.Se, t3._MagickImage_Compose_Set = e31.Te, t3._MagickImage_Compression_Get = e31.Ue, t3._MagickImage_Compression_Set = e31.Ve, t3._MagickImage_Depth_Get = e31.We, t3._MagickImage_Depth_Set = e31.Xe, t3._MagickImage_EncodingGeometry_Get = e31.Ye, t3._MagickImage_Endian_Get = e31.Ze, t3._MagickImage_Endian_Set = e31._e, t3._MagickImage_FileName_Get = e31.$e, t3._MagickImage_FileName_Set = e31.af, t3._MagickImage_FilterType_Get = e31.bf, t3._MagickImage_FilterType_Set = e31.cf, t3._MagickImage_Format_Get = e31.df, t3._MagickImage_Format_Set = e31.ef, t3._MagickImage_Gamma_Get = e31.ff, t3._MagickImage_GifDisposeMethod_Get = e31.gf, t3._MagickImage_GifDisposeMethod_Set = e31.hf, t3._MagickImage_HasAlpha_Get = e31.jf, t3._MagickImage_HasAlpha_Set = e31.kf, t3._MagickImage_Height_Get = e31.lf, t3._MagickImage_Interlace_Get = e31.mf, t3._MagickImage_Interlace_Set = e31.nf, t3._MagickImage_Interpolate_Get = e31.of, t3._MagickImage_Interpolate_Set = e31.pf, t3._MagickImage_IsOpaque_Get = e31.qf, t3._MagickImage_MatteColor_Get = e31.rf, t3._MagickImage_MatteColor_Set = e31.sf, t3._MagickImage_MeanErrorPerPixel_Get = e31.tf, t3._MagickImage_MetaChannelCount_Get = e31.uf, t3._MagickImage_MetaChannelCount_Set = e31.vf, t3._MagickImage_NormalizedMaximumError_Get = e31.wf, t3._MagickImage_NormalizedMeanError_Get = e31.xf, t3._MagickImage_Orientation_Get = e31.yf, t3._MagickImage_Orientation_Set = e31.zf, t3._MagickImage_Page_Get = e31.Af, t3._MagickImage_Page_Set = e31.Bf, t3._MagickImage_Quality_Get = e31.Cf, t3._MagickImage_Quality_Set = e31.Df, t3._MagickImage_RenderingIntent_Get = e31.Ef, t3._MagickImage_RenderingIntent_Set = e31.Ff, t3._MagickImage_ResolutionUnits_Get = e31.Gf, t3._MagickImage_ResolutionUnits_Set = e31.Hf, t3._MagickImage_ResolutionX_Get = e31.If, t3._MagickImage_ResolutionX_Set = e31.Jf, t3._MagickImage_ResolutionY_Get = e31.Kf, t3._MagickImage_ResolutionY_Set = e31.Lf, t3._MagickImage_Signature_Get = e31.Mf, t3._MagickImage_TotalColors_Get = e31.Nf, t3._MagickImage_VirtualPixelMethod_Get = e31.Of, t3._MagickImage_VirtualPixelMethod_Set = e31.Pf, t3._MagickImage_Width_Get = e31.Qf, t3._MagickImage_AdaptiveBlur = e31.Rf, t3._MagickImage_AdaptiveResize = e31.Sf, t3._MagickImage_AdaptiveSharpen = e31.Tf, t3._MagickImage_AdaptiveThreshold = e31.Uf, t3._MagickImage_AddNoise = e31.Vf, t3._MagickImage_AffineTransform = e31.Wf, t3._MagickImage_Annotate = e31.Xf, t3._MagickImage_AutoGamma = e31.Yf, t3._MagickImage_AutoLevel = e31.Zf, t3._MagickImage_AutoOrient = e31._f, t3._MagickImage_AutoThreshold = e31.$f, t3._MagickImage_BilateralBlur = e31.ag, t3._MagickImage_BlackThreshold = e31.bg, t3._MagickImage_BlueShift = e31.cg, t3._MagickImage_Blur = e31.dg, t3._MagickImage_Border = e31.eg, t3._MagickImage_BrightnessContrast = e31.fg, t3._MagickImage_CannyEdge = e31.gg, t3._MagickImage_ChannelOffset = e31.hg, t3._MagickImage_Charcoal = e31.ig, t3._MagickImage_Chop = e31.jg, t3._MagickImage_Clahe = e31.kg, t3._MagickImage_Clamp = e31.lg, t3._MagickImage_ClipPath = e31.mg, t3._MagickImage_Clone = e31.ng, t3._MagickImage_CloneArea = e31.og, t3._MagickImage_Clut = e31.pg, t3._MagickImage_ColorDecisionList = e31.qg, t3._MagickImage_Colorize = e31.rg, t3._MagickImage_ColorMatrix = e31.sg, t3._MagickImage_ColorThreshold = e31.tg, t3._MagickImage_Compare = e31.ug, t3._MagickImage_CompareDistortion = e31.vg, t3._MagickImage_Composite = e31.wg, t3._MagickImage_CompositeGravity = e31.xg, t3._MagickImage_ConnectedComponents = e31.yg, t3._MagickImage_Contrast = e31.zg, t3._MagickImage_ContrastStretch = e31.Ag, t3._MagickImage_ConvexHull = e31.Bg, t3._MagickImage_Convolve = e31.Cg, t3._MagickImage_CopyPixels = e31.Dg, t3._MagickImage_Crop = e31.Eg, t3._MagickImage_CropToTiles = e31.Fg, t3._MagickImage_CycleColormap = e31.Gg, t3._MagickImage_Decipher = e31.Hg, t3._MagickImage_Deskew = e31.Ig, t3._MagickImage_Despeckle = e31.Jg, t3._MagickImage_DetermineBitDepth = e31.Kg, t3._MagickImage_DetermineColorType = e31.Lg, t3._MagickImage_Distort = e31.Mg, t3._MagickImage_Edge = e31.Ng, t3._MagickImage_Emboss = e31.Og, t3._MagickImage_Encipher = e31.Pg, t3._MagickImage_Enhance = e31.Qg, t3._MagickImage_Equalize = e31.Rg, t3._MagickImage_Equals = e31.Sg, t3._MagickImage_EvaluateFunction = e31.Tg, t3._MagickImage_EvaluateGeometry = e31.Ug, t3._MagickImage_EvaluateOperator = e31.Vg, t3._MagickImage_Extent = e31.Wg, t3._MagickImage_Flip = e31.Xg, t3._MagickImage_FloodFill = e31.Yg, t3._MagickImage_Flop = e31.Zg, t3._MagickImage_FontTypeMetrics = e31._g, t3._MagickImage_FormatExpression = e31.$g, t3._MagickImage_Frame = e31.ah, t3._MagickImage_Fx = e31.bh, t3._MagickImage_GammaCorrect = e31.ch, t3._MagickImage_GaussianBlur = e31.dh, t3._MagickImage_GetArtifact = e31.eh, t3._MagickImage_GetAttribute = e31.fh, t3._MagickImage_GetColormapColor = e31.gh, t3._MagickImage_GetNext = e31.hh, t3._MagickImage_GetNextArtifactName = e31.ih, t3._MagickImage_GetNextAttributeName = e31.jh, t3._MagickImage_GetNextProfileName = e31.kh, t3._MagickImage_GetProfile = e31.lh, t3._MagickImage_GetReadMask = e31.mh, t3._MagickImage_GetWriteMask = e31.nh, t3._MagickImage_Grayscale = e31.oh, t3._MagickImage_HaldClut = e31.ph, t3._MagickImage_HasChannel = e31.qh, t3._MagickImage_HasProfile = e31.rh, t3._MagickImage_Histogram = e31.sh, t3._MagickImage_HoughLine = e31.th, t3._MagickImage_Implode = e31.uh, t3._MagickImage_ImportIndexedPixels = e31.vh, t3._MagickImage_ImportPixels = e31.wh, t3._MagickImage_Integral = e31.xh, t3._MagickImage_InterpolativeResize = e31.yh, t3._MagickImage_InverseLevel = e31.zh, t3._MagickImage_Kmeans = e31.Ah, t3._MagickImage_Kuwahara = e31.Bh, t3._MagickImage_Level = e31.Ch, t3._MagickImage_LevelColors = e31.Dh, t3._MagickImage_LinearStretch = e31.Eh, t3._MagickImage_LiquidRescale = e31.Fh, t3._MagickImage_LocalContrast = e31.Gh, t3._MagickImage_Magnify = e31.Hh, t3._MagickImage_MeanShift = e31.Ih, t3._MagickImage_Minify = e31.Jh, t3._MagickImage_MinimumBoundingBox = e31.Kh, t3._MagickImage_Modulate = e31.Lh, t3._MagickImage_Moments = e31.Mh, t3._MagickImage_Morphology = e31.Nh, t3._MagickImage_MotionBlur = e31.Oh, t3._MagickImage_Negate = e31.Ph, t3._MagickImage_Normalize = e31.Qh, t3._MagickImage_OilPaint = e31.Rh, t3._MagickImage_Opaque = e31.Sh, t3._MagickImage_OrderedDither = e31.Th, t3._MagickImage_Perceptible = e31.Uh, t3._MagickImage_PerceptualHash = e31.Vh, t3._MagickImage_Quantize = e31.Wh, t3._MagickImage_Polaroid = e31.Xh, t3._MagickImage_Posterize = e31.Yh, t3._MagickImage_RaiseOrLower = e31.Zh, t3._MagickImage_RandomThreshold = e31._h, t3._MagickImage_RangeThreshold = e31.$h, t3._MagickImage_ReadBlob = e31.ai, t3._MagickImage_ReadFile = e31.bi, t3._MagickImage_ReadPixels = e31.ci, t3._MagickImage_ReadStream = e31.di, t3._MagickImage_RegionMask = e31.ei, t3._MagickImage_Remap = e31.fi, t3._MagickImage_RemoveArtifact = e31.gi, t3._MagickImage_RemoveAttribute = e31.hi, t3._MagickImage_RemoveProfile = e31.ii, t3._MagickImage_ResetArtifactIterator = e31.ji, t3._MagickImage_ResetAttributeIterator = e31.ki, t3._MagickImage_ResetProfileIterator = e31.li, t3._MagickImage_Resample = e31.mi, t3._MagickImage_Resize = e31.ni, t3._MagickImage_Roll = e31.oi, t3._MagickImage_Rotate = e31.pi, t3._MagickImage_RotationalBlur = e31.qi, t3._MagickImage_Sample = e31.ri, t3._MagickImage_Scale = e31.si, t3._MagickImage_Segment = e31.ti, t3._MagickImage_SelectiveBlur = e31.ui, t3._MagickImage_Separate = e31.vi, t3._MagickImage_SepiaTone = e31.wi, t3._MagickImage_SetAlpha = e31.xi, t3._MagickImage_SetArtifact = e31.yi, t3._MagickImage_SetAttribute = e31.zi, t3._MagickImage_SetBitDepth = e31.Ai, t3._MagickImage_SetClientData = e31.Bi, t3._MagickImage_SetColormapColor = e31.Ci, t3._MagickImage_SetColorMetric = e31.Di, t3._MagickImage_SetNext = e31.Ei, t3._MagickImage_SetProfile = e31.Fi, t3._MagickImage_SetProgressDelegate = e31.Gi, t3._MagickImage_SetReadMask = e31.Hi, t3._MagickImage_SetWriteMask = e31.Ii, t3._MagickImage_Shade = e31.Ji, t3._MagickImage_Shadow = e31.Ki, t3._MagickImage_Sharpen = e31.Li, t3._MagickImage_Shave = e31.Mi, t3._MagickImage_Shear = e31.Ni, t3._MagickImage_SigmoidalContrast = e31.Oi, t3._MagickImage_SparseColor = e31.Pi, t3._MagickImage_Spread = e31.Qi, t3._MagickImage_Sketch = e31.Ri, t3._MagickImage_Solarize = e31.Si, t3._MagickImage_SortPixels = e31.Ti, t3._MagickImage_Splice = e31.Ui, t3._MagickImage_Statistic = e31.Vi, t3._MagickImage_Statistics = e31.Wi, t3._MagickImage_Stegano = e31.Xi, t3._MagickImage_Stereo = e31.Yi, t3._MagickImage_Strip = e31.Zi, t3._MagickImage_SubImageSearch = e31._i, t3._MagickImage_Swirl = e31.$i, t3._MagickImage_Texture = e31.aj, t3._MagickImage_Threshold = e31.bj, t3._MagickImage_Thumbnail = e31.cj, t3._MagickImage_Tint = e31.dj, t3._MagickImage_Transparent = e31.ej, t3._MagickImage_TransparentChroma = e31.fj, t3._MagickImage_Transpose = e31.gj, t3._MagickImage_Transverse = e31.hj, t3._MagickImage_Trim = e31.ij, t3._MagickImage_UniqueColors = e31.jj, t3._MagickImage_UnsharpMask = e31.kj, t3._MagickImage_Vignette = e31.lj, t3._MagickImage_Wave = e31.mj, t3._MagickImage_WaveletDenoise = e31.nj, t3._MagickImage_WhiteBalance = e31.oj, t3._MagickImage_WhiteThreshold = e31.pj, t3._MagickImage_WriteBlob = e31.qj, t3._MagickImage_WriteFile = e31.rj, t3._MagickImage_WriteStream = e31.sj, t3._MagickImageCollection_Append = e31.tj, t3._MagickImageCollection_Coalesce = e31.uj, t3._MagickImageCollection_Combine = e31.vj, t3._MagickImageCollection_Complex = e31.wj, t3._MagickImageCollection_Deconstruct = e31.xj, t3._MagickImageCollection_Dispose = e31.yj, t3._MagickImageCollection_Evaluate = e31.zj, t3._MagickImageCollection_Fx = e31.Aj, t3._MagickImageCollection_Merge = e31.Bj, t3._MagickImageCollection_Montage = e31.Cj, t3._MagickImageCollection_Morph = e31.Dj, t3._MagickImageCollection_Optimize = e31.Ej, t3._MagickImageCollection_OptimizePlus = e31.Fj, t3._MagickImageCollection_OptimizeTransparency = e31.Gj, t3._MagickImageCollection_Polynomial = e31.Hj, t3._MagickImageCollection_Quantize = e31.Ij, t3._MagickImageCollection_ReadBlob = e31.Jj, t3._MagickImageCollection_ReadFile = e31.Kj, t3._MagickImageCollection_ReadStream = e31.Lj, t3._MagickImageCollection_Remap = e31.Mj, t3._MagickImageCollection_Smush = e31.Nj, t3._MagickImageCollection_WriteFile = e31.Oj, t3._MagickImageCollection_WriteStream = e31.Pj, t3._DoubleMatrix_Create = e31.Qj, t3._DoubleMatrix_Dispose = e31.Rj, t3._OpenCL_GetDevices = e31.Sj, t3._OpenCL_GetDevice = e31.Tj, t3._OpenCL_GetEnabled = e31.Uj, t3._OpenCL_SetEnabled = e31.Vj, t3._OpenCLDevice_DeviceType_Get = e31.Wj, t3._OpenCLDevice_BenchmarkScore_Get = e31.Xj, t3._OpenCLDevice_IsEnabled_Get = e31.Yj, t3._OpenCLDevice_IsEnabled_Set = e31.Zj, t3._OpenCLDevice_Name_Get = e31._j, t3._OpenCLDevice_Version_Get = e31.$j, t3._OpenCLDevice_GetKernelProfileRecords = e31.ak, t3._OpenCLDevice_GetKernelProfileRecord = e31.bk, t3._OpenCLDevice_SetProfileKernels = e31.ck, t3._OpenCLKernelProfileRecord_Count_Get = e31.dk, t3._OpenCLKernelProfileRecord_Name_Get = e31.ek, t3._OpenCLKernelProfileRecord_MaximumDuration_Get = e31.fk, t3._OpenCLKernelProfileRecord_MinimumDuration_Get = e31.gk, t3._OpenCLKernelProfileRecord_TotalDuration_Get = e31.hk, t3._JpegOptimizer_CompressFile = e31.ik, t3._JpegOptimizer_CompressStream = e31.jk, bi = t3._malloc = e31.kk, Q = t3._free = e31.lk, t3._PixelCollection_Create = e31.mk, t3._PixelCollection_Dispose = e31.nk, t3._PixelCollection_GetArea = e31.ok, t3._PixelCollection_GetReadOnlyArea = e31.pk, t3._PixelCollection_SetArea = e31.qk, t3._PixelCollection_ToByteArray = e31.rk, t3._PixelCollection_ToShortArray = e31.sk, t3._Quantum_Depth_Get = e31.tk, t3._Quantum_Max_Get = e31.uk, t3._ResourceLimits_Area_Get = e31.vk, t3._ResourceLimits_Area_Set = e31.wk, t3._ResourceLimits_Disk_Get = e31.xk, t3._ResourceLimits_Disk_Set = e31.yk, t3._ResourceLimits_Height_Get = e31.zk, t3._ResourceLimits_Height_Set = e31.Ak, t3._ResourceLimits_ListLength_Get = e31.Bk, t3._ResourceLimits_ListLength_Set = e31.Ck, t3._ResourceLimits_MaxMemoryRequest_Get = e31.Dk, t3._ResourceLimits_MaxMemoryRequest_Set = e31.Ek, t3._ResourceLimits_MaxProfileSize_Get = e31.Fk, t3._ResourceLimits_MaxProfileSize_Set = e31.Gk, t3._ResourceLimits_Memory_Get = e31.Hk, t3._ResourceLimits_Memory_Set = e31.Ik, t3._ResourceLimits_Thread_Get = e31.Jk, t3._ResourceLimits_Thread_Set = e31.Kk, t3._ResourceLimits_Throttle_Get = e31.Lk, t3._ResourceLimits_Throttle_Set = e31.Mk, t3._ResourceLimits_Time_Get = e31.Nk, t3._ResourceLimits_Time_Set = e31.Ok, t3._ResourceLimits_Width_Get = e31.Pk, t3._ResourceLimits_Width_Set = e31.Qk, t3._ResourceLimits_LimitMemory = e31.Rk, t3._ResourceLimits_TrimMemory = e31.Sk, t3._DrawingSettings_Create = e31.Tk, t3._DrawingSettings_Dispose = e31.Uk, t3._DrawingSettings_BorderColor_Get = e31.Vk, t3._DrawingSettings_BorderColor_Set = e31.Wk, t3._DrawingSettings_FillColor_Get = e31.Xk, t3._DrawingSettings_FillColor_Set = e31.Yk, t3._DrawingSettings_FillRule_Get = e31.Zk, t3._DrawingSettings_FillRule_Set = e31._k, t3._DrawingSettings_Font_Get = e31.$k, t3._DrawingSettings_Font_Set = e31.al, t3._DrawingSettings_FontFamily_Get = e31.bl, t3._DrawingSettings_FontFamily_Set = e31.cl, t3._DrawingSettings_FontPointsize_Get = e31.dl, t3._DrawingSettings_FontPointsize_Set = e31.el, t3._DrawingSettings_FontStyle_Get = e31.fl, t3._DrawingSettings_FontStyle_Set = e31.gl, t3._DrawingSettings_FontWeight_Get = e31.hl, t3._DrawingSettings_FontWeight_Set = e31.il, t3._DrawingSettings_StrokeAntiAlias_Get = e31.jl, t3._DrawingSettings_StrokeAntiAlias_Set = e31.kl, t3._DrawingSettings_StrokeColor_Get = e31.ll, t3._DrawingSettings_StrokeColor_Set = e31.ml, t3._DrawingSettings_StrokeDashOffset_Get = e31.nl, t3._DrawingSettings_StrokeDashOffset_Set = e31.ol, t3._DrawingSettings_StrokeLineCap_Get = e31.pl, t3._DrawingSettings_StrokeLineCap_Set = e31.ql, t3._DrawingSettings_StrokeLineJoin_Get = e31.rl, t3._DrawingSettings_StrokeLineJoin_Set = e31.sl, t3._DrawingSettings_StrokeMiterLimit_Get = e31.tl, t3._DrawingSettings_StrokeMiterLimit_Set = e31.ul, t3._DrawingSettings_StrokeWidth_Get = e31.vl, t3._DrawingSettings_StrokeWidth_Set = e31.wl, t3._DrawingSettings_TextAntiAlias_Get = e31.xl, t3._DrawingSettings_TextAntiAlias_Set = e31.yl, t3._DrawingSettings_TextDirection_Get = e31.zl, t3._DrawingSettings_TextDirection_Set = e31.Al, t3._DrawingSettings_TextEncoding_Get = e31.Bl, t3._DrawingSettings_TextEncoding_Set = e31.Cl, t3._DrawingSettings_TextGravity_Get = e31.Dl, t3._DrawingSettings_TextGravity_Set = e31.El, t3._DrawingSettings_TextInterlineSpacing_Get = e31.Fl, t3._DrawingSettings_TextInterlineSpacing_Set = e31.Gl, t3._DrawingSettings_TextInterwordSpacing_Get = e31.Hl, t3._DrawingSettings_TextInterwordSpacing_Set = e31.Il, t3._DrawingSettings_TextKerning_Get = e31.Jl, t3._DrawingSettings_TextKerning_Set = e31.Kl, t3._DrawingSettings_TextUnderColor_Get = e31.Ll, t3._DrawingSettings_TextUnderColor_Set = e31.Ml, t3._DrawingSettings_SetAffine = e31.Nl, t3._DrawingSettings_SetFillPattern = e31.Ol, t3._DrawingSettings_SetStrokeDashArray = e31.Pl, t3._DrawingSettings_SetStrokePattern = e31.Ql, t3._DrawingSettings_SetText = e31.Rl, t3._MagickSettings_Create = e31.Sl, t3._MagickSettings_Dispose = e31.Tl, t3._MagickSettings_AntiAlias_Get = e31.Ul, t3._MagickSettings_AntiAlias_Set = e31.Vl, t3._MagickSettings_BackgroundColor_Get = e31.Wl, t3._MagickSettings_BackgroundColor_Set = e31.Xl, t3._MagickSettings_ColorSpace_Get = e31.Yl, t3._MagickSettings_ColorSpace_Set = e31.Zl, t3._MagickSettings_ColorType_Get = e31._l, t3._MagickSettings_ColorType_Set = e31.$l, t3._MagickSettings_Compression_Get = e31.am, t3._MagickSettings_Compression_Set = e31.bm, t3._MagickSettings_Debug_Get = e31.cm, t3._MagickSettings_Debug_Set = e31.dm, t3._MagickSettings_Density_Get = e31.em, t3._MagickSettings_Density_Set = e31.fm, t3._MagickSettings_Depth_Get = e31.gm, t3._MagickSettings_Depth_Set = e31.hm, t3._MagickSettings_Endian_Get = e31.im, t3._MagickSettings_Endian_Set = e31.jm, t3._MagickSettings_Extract_Get = e31.km, t3._MagickSettings_Extract_Set = e31.lm, t3._MagickSettings_Format_Get = e31.mm, t3._MagickSettings_Format_Set = e31.nm, t3._MagickSettings_FontPointsize_Get = e31.om, t3._MagickSettings_FontPointsize_Set = e31.pm, t3._MagickSettings_Interlace_Get = e31.qm, t3._MagickSettings_Interlace_Set = e31.rm, t3._MagickSettings_Monochrome_Get = e31.sm, t3._MagickSettings_Monochrome_Set = e31.tm, t3._MagickSettings_Verbose_Get = e31.um, t3._MagickSettings_Verbose_Set = e31.vm, t3._MagickSettings_SetColorFuzz = e31.wm, t3._MagickSettings_SetFileName = e31.xm, t3._MagickSettings_SetFont = e31.ym, t3._MagickSettings_SetNumberScenes = e31.zm, t3._MagickSettings_SetOption = e31.Am, t3._MagickSettings_SetPage = e31.Bm, t3._MagickSettings_SetPing = e31.Cm, t3._MagickSettings_SetQuality = e31.Dm, t3._MagickSettings_SetScenes = e31.Em, t3._MagickSettings_SetScene = e31.Fm, t3._MagickSettings_SetSize = e31.Gm, t3._MontageSettings_Create = e31.Hm, t3._MontageSettings_Dispose = e31.Im, t3._MontageSettings_SetBackgroundColor = e31.Jm, t3._MontageSettings_SetBorderColor = e31.Km, t3._MontageSettings_SetBorderWidth = e31.Lm, t3._MontageSettings_SetFillColor = e31.Mm, t3._MontageSettings_SetFont = e31.Nm, t3._MontageSettings_SetFontPointsize = e31.Om, t3._MontageSettings_SetFrameGeometry = e31.Pm, t3._MontageSettings_SetGeometry = e31.Qm, t3._MontageSettings_SetGravity = e31.Rm, t3._MontageSettings_SetShadow = e31.Sm, t3._MontageSettings_SetStrokeColor = e31.Tm, t3._MontageSettings_SetTextureFileName = e31.Um, t3._MontageSettings_SetTileGeometry = e31.Vm, t3._MontageSettings_SetTitle = e31.Wm, t3._QuantizeSettings_SetColors = e31.Xm, t3._QuantizeSettings_SetColorSpace = e31.Ym, t3._QuantizeSettings_SetDitherMethod = e31.Zm, t3._QuantizeSettings_SetMeasureErrors = e31._m, t3._QuantizeSettings_SetTreeDepth = e31.$m, t3._ChannelMoments_Centroid_Get = e31.an, t3._ChannelMoments_EllipseAngle_Get = e31.bn, t3._ChannelMoments_EllipseAxis_Get = e31.cn, t3._ChannelMoments_EllipseEccentricity_Get = e31.dn, t3._ChannelMoments_EllipseIntensity_Get = e31.en, t3._ChannelMoments_GetHuInvariants = e31.fn, t3._ChannelPerceptualHash_GetHuPhash = e31.gn, t3._ChannelStatistics_Depth_Get = e31.hn, t3._ChannelStatistics_Entropy_Get = e31.jn, t3._ChannelStatistics_Kurtosis_Get = e31.kn, t3._ChannelStatistics_Maximum_Get = e31.ln, t3._ChannelStatistics_Mean_Get = e31.mn, t3._ChannelStatistics_Minimum_Get = e31.nn, t3._ChannelStatistics_Skewness_Get = e31.on, t3._ChannelStatistics_StandardDeviation_Get = e31.pn, t3._Moments_DisposeList = e31.qn, t3._Moments_GetInstance = e31.rn, t3._PerceptualHash_DisposeList = e31.sn, t3._PerceptualHash_GetInstance = e31.tn, t3._Statistics_DisposeList = e31.un, t3._Statistics_GetInstance = e31.vn, t3._ConnectedComponent_DisposeList = e31.wn, t3._ConnectedComponent_GetArea = e31.xn, t3._ConnectedComponent_GetCentroid = e31.yn, t3._ConnectedComponent_GetColor = e31.zn, t3._ConnectedComponent_GetHeight = e31.An, t3._ConnectedComponent_GetId = e31.Bn, t3._ConnectedComponent_GetWidth = e31.Cn, t3._ConnectedComponent_GetX = e31.Dn, t3._ConnectedComponent_GetY = e31.En, t3._ConnectedComponent_GetInstance = e31.Fn, t3._MagickGeometry_Create = e31.Gn, t3._MagickGeometry_Dispose = e31.Hn, t3._MagickGeometry_X_Get = e31.In, t3._MagickGeometry_Y_Get = e31.Jn, t3._MagickGeometry_Width_Get = e31.Kn, t3._MagickGeometry_Height_Get = e31.Ln, t3._MagickGeometry_Initialize = e31.Mn, t3._MagickRectangle_Dispose = e31.Nn, t3._MagickRectangle_X_Get = e31.On, t3._MagickRectangle_X_Set = e31.Pn, t3._MagickRectangle_Y_Get = e31.Qn, t3._MagickRectangle_Y_Set = e31.Rn, t3._MagickRectangle_Width_Get = e31.Sn, t3._MagickRectangle_Width_Set = e31.Tn, t3._MagickRectangle_Height_Get = e31.Un, t3._MagickRectangle_Height_Set = e31.Vn, t3._MagickRectangle_FromPageSize = e31.Wn, t3._OffsetInfo_Create = e31.Xn, t3._OffsetInfo_Dispose = e31.Yn, t3._OffsetInfo_SetX = e31.Zn, t3._OffsetInfo_SetY = e31._n, t3._PointInfo_X_Get = e31.$n, t3._PointInfo_Y_Get = e31.ao, t3._PointInfoCollection_Create = e31.bo, t3._PointInfoCollection_Dispose = e31.co, t3._PointInfoCollection_GetX = e31.eo, t3._PointInfoCollection_GetY = e31.fo, t3._PointInfoCollection_Set = e31.go, t3._PrimaryInfo_Dispose = e31.ho, t3._PrimaryInfo_X_Get = e31.io, t3._PrimaryInfo_X_Set = e31.jo, t3._PrimaryInfo_Y_Get = e31.ko, t3._PrimaryInfo_Y_Set = e31.lo, t3._PrimaryInfo_Z_Get = e31.mo, t3._PrimaryInfo_Z_Set = e31.no, t3._StringInfo_Length_Get = e31.oo, t3._StringInfo_Datum_Get = e31.po, t3._TypeMetric_Dispose = e31.qo, t3._TypeMetric_Ascent_Get = e31.ro, t3._TypeMetric_Descent_Get = e31.so, t3._TypeMetric_MaxHorizontalAdvance_Get = e31.to, t3._TypeMetric_TextHeight_Get = e31.uo, t3._TypeMetric_TextWidth_Get = e31.vo, t3._TypeMetric_UnderlinePosition_Get = e31.wo, t3._TypeMetric_UnderlineThickness_Get = e31.xo, xi = e31.yo, $ = e31.zo, Si = e31.Ao, Ci = e31.Bo, wi = e31.Co, Ti = e31.Do, Ei = e31.Eo, Di = e31.Fo, Oi = e31.Go, ki = e31.pb, Ai = e31.Kb;
  }
  var Mi = {
    kb: me2,
    s: he2,
    v: ge2,
    e: ye2,
    l: be2,
    Na: j2,
    ba: xe2,
    b: Se2,
    ab: Ce2,
    i: we2,
    Ga: H2,
    Ea: et2,
    Ha: tt,
    nb: nt2,
    Da: rt2,
    U: at,
    Ca: ot,
    wa: ct,
    jb: lt,
    Ka: ut,
    za: dt,
    Aa: ft,
    S: pt,
    ib: mt,
    gb: ht,
    hb: gt,
    Ba: _t,
    fb: vt,
    oa: yt,
    Ia: bt,
    Wa: At,
    ea: Pt,
    Ta: Ft,
    Z: Sn,
    Ra: On,
    F: jn,
    g: Nn,
    da: Ln,
    p: Wn,
    D: Gn,
    u: Kn,
    Sa: qn,
    W: tr,
    Xa: nr,
    Y: rr,
    Ua: ir,
    lb: ar,
    db: or,
    bb: sr,
    y: mr,
    t: En,
    Va: hr,
    x: gr,
    X: _r,
    G: vr,
    P: yr,
    w: br,
    E: xr,
    qa: Sr,
    ra: Dr,
    sa: Or,
    ob: kr,
    pa: Ar,
    ta: jr,
    Fa: Ir,
    $: Nr,
    eb: Rr,
    R: Mr,
    cb: Br,
    La: Wr,
    Ma: Gr,
    H: Jr,
    K: Yr,
    _: Xr,
    mb: Qr,
    aa: $r,
    ua: ei,
    ya: ti,
    T: ri,
    _a: Xi,
    ka: _a,
    la: ga,
    r: Ki,
    a: Ii,
    c: Fi,
    h: Pi,
    k: Bi,
    $a: ha,
    I: Yi,
    d: Wi,
    N: Qi,
    q: Ui,
    Za: $i,
    Ya: na,
    L: sa,
    ma,
    Qa: ca,
    C: Gi,
    ja: qi,
    O: fa,
    V: la,
    z: Hi,
    xa: Vi,
    o: oa,
    m: Li,
    f: Ri,
    ha: ea,
    ga: ta,
    n: Ni,
    j: zi,
    B: Zi,
    M: ia,
    A: aa,
    Pa: ua,
    fa: ra,
    J: va,
    Oa: da,
    Q: ya,
    na: pa,
    ia: Ji,
    ca: ii,
    Ja: qr,
    va: ai
  };
  function Ni(e31, t4, n3, r3) {
    var i2 = S2();
    try {
      T2(e31)(t4, n3, r3);
    } catch (e32) {
      if (x2(i2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Pi(e31, t4, n3, r3) {
    var i2 = S2();
    try {
      return T2(e31)(t4, n3, r3);
    } catch (e32) {
      if (x2(i2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Fi(e31, t4, n3) {
    var r3 = S2();
    try {
      return T2(e31)(t4, n3);
    } catch (e32) {
      if (x2(r3), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Ii(e31, t4) {
    var n3 = S2();
    try {
      return T2(e31)(t4);
    } catch (e32) {
      if (x2(n3), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Li(e31, t4) {
    var n3 = S2();
    try {
      T2(e31)(t4);
    } catch (e32) {
      if (x2(n3), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Ri(e31, t4, n3) {
    var r3 = S2();
    try {
      T2(e31)(t4, n3);
    } catch (e32) {
      if (x2(r3), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function zi(e31, t4, n3, r3, i2) {
    var a2 = S2();
    try {
      T2(e31)(t4, n3, r3, i2);
    } catch (e32) {
      if (x2(a2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Bi(e31, t4, n3, r3, i2) {
    var a2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2);
    } catch (e32) {
      if (x2(a2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Vi(e31, t4, n3, r3) {
    var i2 = S2();
    try {
      return T2(e31)(t4, n3, r3);
    } catch (e32) {
      if (x2(i2), !(e32 instanceof g2)) throw e32;
      return $(1, 0), 0n;
    }
  }
  function Hi(e31, t4) {
    var n3 = S2();
    try {
      return T2(e31)(t4);
    } catch (e32) {
      if (x2(n3), !(e32 instanceof g2)) throw e32;
      return $(1, 0), 0n;
    }
  }
  function Ui(e31, t4, n3, r3, i2, a2, o2, s2, c2) {
    var l2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2, a2, o2, s2, c2);
    } catch (e32) {
      if (x2(l2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Wi(e31, t4, n3, r3, i2, a2, o2) {
    var s2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2, a2, o2);
    } catch (e32) {
      if (x2(s2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Gi(e31, t4, n3, r3, i2) {
    var a2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2);
    } catch (e32) {
      if (x2(a2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Ki(e31) {
    var t4 = S2();
    try {
      return T2(e31)();
    } catch (e32) {
      if (x2(t4), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function qi(e31, t4, n3) {
    var r3 = S2();
    try {
      return T2(e31)(t4, n3);
    } catch (e32) {
      if (x2(r3), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Ji(e31, t4, n3) {
    var r3 = S2();
    try {
      T2(e31)(t4, n3);
    } catch (e32) {
      if (x2(r3), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Yi(e31, t4, n3, r3, i2, a2) {
    var o2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2, a2);
    } catch (e32) {
      if (x2(o2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Xi(e31, t4, n3) {
    var r3 = S2();
    try {
      return T2(e31)(t4, n3);
    } catch (e32) {
      if (x2(r3), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Zi(e31, t4, n3, r3, i2, a2) {
    var o2 = S2();
    try {
      T2(e31)(t4, n3, r3, i2, a2);
    } catch (e32) {
      if (x2(o2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function Qi(e31, t4, n3, r3, i2, a2, o2, s2) {
    var c2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2, a2, o2, s2);
    } catch (e32) {
      if (x2(c2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function $i(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2) {
    var u2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2, a2, o2, s2, c2, l2);
    } catch (e32) {
      if (x2(u2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ea(e31, t4, n3, r3) {
    var i2 = S2();
    try {
      T2(e31)(t4, n3, r3);
    } catch (e32) {
      if (x2(i2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ta(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2, u2) {
    var d2 = S2();
    try {
      T2(e31)(t4, n3, r3, i2, a2, o2, s2, c2, l2, u2);
    } catch (e32) {
      if (x2(d2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function na(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2, u2) {
    var d2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2, a2, o2, s2, c2, l2, u2);
    } catch (e32) {
      if (x2(d2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ra(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2) {
    var u2 = S2();
    try {
      T2(e31)(t4, n3, r3, i2, a2, o2, s2, c2, l2);
    } catch (e32) {
      if (x2(u2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ia(e31, t4, n3, r3, i2, a2, o2) {
    var s2 = S2();
    try {
      T2(e31)(t4, n3, r3, i2, a2, o2);
    } catch (e32) {
      if (x2(s2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function aa(e31, t4, n3, r3, i2, a2, o2, s2) {
    var c2 = S2();
    try {
      T2(e31)(t4, n3, r3, i2, a2, o2, s2);
    } catch (e32) {
      if (x2(c2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function oa(e31) {
    var t4 = S2();
    try {
      T2(e31)();
    } catch (e32) {
      if (x2(t4), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function sa(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2, u2, d2) {
    var f2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2, a2, o2, s2, c2, l2, u2, d2);
    } catch (e32) {
      if (x2(f2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ca(e31, t4, n3, r3, i2, a2) {
    var o2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2, a2);
    } catch (e32) {
      if (x2(o2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function la(e31, t4) {
    var n3 = S2();
    try {
      return T2(e31)(t4);
    } catch (e32) {
      if (x2(n3), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ua(e31, t4, n3, r3, i2, a2, o2, s2, c2) {
    var l2 = S2();
    try {
      T2(e31)(t4, n3, r3, i2, a2, o2, s2, c2);
    } catch (e32) {
      if (x2(l2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function da(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2, u2, d2) {
    var f2 = S2();
    try {
      T2(e31)(t4, n3, r3, i2, a2, o2, s2, c2, l2, u2, d2);
    } catch (e32) {
      if (x2(f2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function fa(e31, t4, n3, r3) {
    var i2 = S2();
    try {
      return T2(e31)(t4, n3, r3);
    } catch (e32) {
      if (x2(i2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function pa(e31, t4, n3, r3, i2, a2) {
    var o2 = S2();
    try {
      T2(e31)(t4, n3, r3, i2, a2);
    } catch (e32) {
      if (x2(o2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ma(e31, t4, n3, r3, i2, a2) {
    var o2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2, a2);
    } catch (e32) {
      if (x2(o2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ha(e31, t4, n3, r3, i2, a2) {
    var o2 = S2();
    try {
      return T2(e31)(t4, n3, r3, i2, a2);
    } catch (e32) {
      if (x2(o2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ga(e31, t4, n3, r3) {
    var i2 = S2();
    try {
      return T2(e31)(t4, n3, r3);
    } catch (e32) {
      if (x2(i2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function _a(e31, t4, n3, r3) {
    var i2 = S2();
    try {
      return T2(e31)(t4, n3, r3);
    } catch (e32) {
      if (x2(i2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function va(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2, u2) {
    var d2 = S2();
    try {
      T2(e31)(t4, n3, r3, i2, a2, o2, s2, c2, l2, u2);
    } catch (e32) {
      if (x2(d2), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ya(e31, t4, n3, r3, i2, a2, o2, s2, c2, l2, u2, d2, f2, p3, m3, h3) {
    var ee3 = S2();
    try {
      T2(e31)(t4, n3, r3, i2, a2, o2, s2, c2, l2, u2, d2, f2, p3, m3, h3);
    } catch (e32) {
      if (x2(ee3), !(e32 instanceof g2)) throw e32;
      $(1, 0);
    }
  }
  function ba(e31) {
    e31 = Object.assign({}, e31);
    var t4 = (e32) => (t5) => e32(t5) >>> 0;
    return e31.rb = t4(e31.rb), e31.kk = t4(e31.kk), e31.yo = /* @__PURE__ */ ((e32) => (t5, n3) => e32(t5, n3) >>> 0)(e31.yo), e31._emscripten_stack_alloc = t4(e31._emscripten_stack_alloc), e31.Co = /* @__PURE__ */ ((e32) => () => e32() >>> 0)(e31.Co), e31.Go = t4(e31.Go), e31;
  }
  async function xa() {
    Ge2 && await We2(), !m2 && re2();
  }
  var Sa = await y2();
  return await xa(), t3;
}
var B = class {
  constructor(e30) {
    if (e30 instanceof URL) {
      if (e30.protocol !== "http:" && e30.protocol !== "https:") throw new y("Only http/https protocol is supported");
      this.locateFile = () => e30.href;
    } else e30 instanceof WebAssembly.Module ? this.instantiateWasm = (t3, n2) => {
      n2(new WebAssembly.Instance(e30, t3));
    } : this.wasmBinary = e30;
  }
  wasmBinary;
  instantiateWasm;
  locateFile;
};
var V = class {
  api;
  constructor() {
  }
  async _initialize(e30, t3, n2) {
    if (this.api !== void 0) return;
    let r2 = await e30(new B(t3));
    this.writeConfigurationFiles(r2, n2), C(r2, "MAGICK_CONFIGURE_PATH", (e31) => {
      C(r2, "/xml", (t4) => {
        r2._Environment_SetEnv(e31, t4), r2._Environment_Initialize(), this.api = r2;
      });
    });
  }
  static get _api() {
    if (!H.api) throw new y("`await initializeImageMagick` should be called to initialize the library");
    return H.api;
  }
  static set _api(e30) {
    H.api = e30;
  }
  static read(t3, n2, r2, i) {
    return R._create((a) => {
      let o = i;
      if (typeof t3 != "string" && !e(t3)) typeof n2 == "number" && typeof r2 == "number" && a.read(t3, n2, r2);
      else if (typeof n2 != "number" && typeof r2 != "number") {
        o = r2;
        let e30;
        n2 instanceof Fe ? e30 = n2 : typeof n2 == "string" ? (e30 = new Fe(), e30.format = n2) : o = n2, a.read(t3, e30);
      }
      return o(a);
    });
  }
  static readCollection(e30, t3, n2) {
    return ze.use((r2) => {
      let i = n2, a;
      return t3 instanceof Fe ? a = t3 : typeof t3 == "string" ? (a = new Fe(), a.format = t3) : i = t3, r2.read(e30, a), i(r2);
    });
  }
  static readFromCanvas(e30, t3, n2) {
    return R._create((r2) => (r2.readFromCanvas(e30, n2), t3(r2)));
  }
  writeConfigurationFiles(e30, t3) {
    e30.FS.analyzePath("/xml").exists || e30.FS.mkdir("/xml");
    for (let n2 of t3.all()) {
      let t4 = e30.FS.open(`/xml/${n2.fileName}`, "w"), r2 = new TextEncoder().encode(n2.data);
      e30.FS.write(t4, r2, 0, r2.length), e30.FS.close(t4);
    }
  }
};
var H = new V();
async function et(e30, t3) {
  await H._initialize(z, e30, t3 ?? r.default);
}
var nt = class {
  constructor(e30, t3, n2) {
    this.origin = e30, this.progress = new L((t3 + 1) / (n2 * 100));
  }
  origin;
  progress;
  cancel = false;
};
var rt = class e26 {
  static _logDelegate = 0;
  static _onLog;
  static _progressDelegate = 0;
  static _images = {};
  static setLogDelegate(t3) {
    e26._logDelegate === 0 && t3 !== void 0 && (e26._logDelegate = V._api.addFunction(e26.logDelegate, "vii")), V._api._Magick_SetLogDelegate(t3 === void 0 ? 0 : e26._logDelegate), e26._onLog = t3;
  }
  static setProgressDelegate(t3) {
    e26._progressDelegate === 0 && (this._progressDelegate = V._api.addFunction(e26.progressDelegate, "iijji")), this._images[t3._instance.toString()] = t3, V._api._MagickImage_SetClientData(t3._instance, t3._instance), V._api._MagickImage_SetProgressDelegate(t3._instance, E(e26._progressDelegate));
  }
  static removeProgressDelegate(t3) {
    V._api._MagickImage_SetClientData(t3._instance, V._api._NullPointer), V._api._MagickImage_SetProgressDelegate(t3._instance, V._api._NullPointer), delete e26._images[t3._instance.toString()];
  }
  static logDelegate(t3, n2) {
    if (e26._onLog === void 0) return;
    let r2 = S(E(n2), "");
    e26._onLog(new p(t3, r2));
  }
  static progressDelegate(t3, n2, r2, i) {
    let a = e26._images[i];
    if (a === void 0 || a.onProgress === void 0) return 1;
    let o = Number(n2), s = Number(r2), c = new nt(S(E(t3)), o, s);
    return a.onProgress(c), +!c.cancel;
  }
};
var it = class e27 {
  static _allFormats;
  constructor(e30, t3, n2, r2, i, a, o, s) {
    this.format = e30, this.description = t3, this.mimeType = n2, this.moduleFormat = r2, this.supportsMultipleFrames = i, this.supportsReading = a, this.supportsWriting = o, this.version = s;
  }
  description;
  format;
  mimeType;
  moduleFormat;
  supportsMultipleFrames;
  supportsReading;
  supportsWriting;
  version;
  static get all() {
    return e27._allFormats === void 0 && (e27._allFormats = e27.loadFormats()), e27._allFormats;
  }
  static loadFormats() {
    return j.usePointer((t3) => be.use((n2) => {
      let r2 = V._api._MagickFormatInfo_CreateList(n2.ptr, t3), i = n2.value;
      try {
        let n3 = Array(Number(i)), a = Object.values(Ae);
        for (let o = 0; o < i; o++) {
          let i2 = V._api._MagickFormatInfo_GetInfo(r2, E(o), t3), s = S(V._api._MagickFormatInfo_Format_Get(i2)), c = e27.convertFormat(s, a), l = S(V._api._MagickFormatInfo_Description_Get(i2), ""), u = S(V._api._MagickFormatInfo_MimeType_Get(i2)), d = S(V._api._MagickFormatInfo_Module_Get(i2)), f = e27.convertFormat(d, a), p2 = V._api._MagickFormatInfo_SupportsMultipleFrames_Get(i2) == 1, m2 = V._api._MagickFormatInfo_SupportsReading_Get(i2) == 1, h2 = V._api._MagickFormatInfo_SupportsWriting_Get(i2) == 1, g2 = S(V._api._MagickFormatInfo_Version_Get(i2));
          n3[o] = new e27(c, l, u, f, p2, m2, h2, g2);
        }
        return n3;
      } finally {
        V._api._MagickFormatInfo_DisposeList(r2, i);
      }
    }));
  }
  static convertFormat(e30, t3) {
    return e30 === null ? Ae.Unknown : t3.includes(e30) ? e30 : Ae.Unknown;
  }
};
var U = {
  None: 0,
  Accelerate: 1,
  Annotate: 2,
  Blob: 4,
  Cache: 8,
  Coder: 16,
  Configure: 32,
  Deprecate: 64,
  Draw: 128,
  Exception: 256,
  Image: 512,
  Locale: 1024,
  Module: 2048,
  Pixel: 4096,
  Policy: 8192,
  Resource: 16384,
  Trace: 32768,
  Transform: 65536,
  User: 131072,
  Wand: 262144,
  Detailed: 2147450879,
  get All() {
    return this.Detailed | this.Trace;
  }
};
var W = class e28 {
  static get delegates() {
    return S(V._api._Magick_Delegates_Get(), "Unknown");
  }
  static get features() {
    return S(V._api._Magick_Features_Get(), " ").slice(0, -1);
  }
  static get imageMagickVersion() {
    return S(V._api._Magick_ImageMagickVersion_Get(), "Unknown");
  }
  static get supportedFormats() {
    return it.all;
  }
  static onLog;
  static addFont(e30, t3) {
    let n2 = V._api.FS;
    n2.analyzePath("/fonts").exists || n2.mkdir("/fonts");
    let r2 = n2.open(`/fonts/${e30}`, "w");
    n2.write(r2, t3, 0, t3.length), n2.close(r2);
  }
  static resetRandomSeed = () => V._api._Magick_ResetRandomSeed();
  static setRandomSeed = (e30) => V._api._Magick_SetRandomSeed(e30);
  static setLogEvents(t3) {
    let n2 = t3 == U.None ? void 0 : e28.logDelegate;
    rt.setLogDelegate(n2), w(e28.getEventTypeString(t3), (e30) => V._api._Magick_SetLogEvents(e30));
  }
  static _getFontFileName(e30) {
    let t3 = `/fonts/${e30}`;
    if (!V._api.FS.analyzePath(t3).exists) throw `Unable to find a font with the name '${e30}', register it with the addFont method of the Magick class.`;
    return t3;
  }
  static getEventTypeString(e30) {
    if (e30 == U.All) return "All,Trace";
    if (e30 == U.Detailed) return "All";
    switch (e30) {
      case U.Accelerate:
        return "Accelerate";
      case U.Annotate:
        return "Annotate";
      case U.Blob:
        return "Blob";
      case U.Cache:
        return "Cache";
      case U.Coder:
        return "Coder";
      case U.Configure:
        return "Configure";
      case U.Deprecate:
        return "Deprecate";
      case U.Draw:
        return "Draw";
      case U.Exception:
        return "Exception";
      case U.Image:
        return "Image";
      case U.Locale:
        return "Locale";
      case U.Module:
        return "Module";
      case U.Pixel:
        return "Pixel";
      case U.Policy:
        return "Policy";
      case U.Resource:
        return "Resource";
      case U.Trace:
        return "Trace";
      case U.Transform:
        return "Transform";
      case U.User:
        return "User";
      case U.Wand:
        return "Wand";
      case U.None:
      default:
        return "None";
    }
  }
  static logDelegate(t3) {
    e28.onLog !== void 0 && e28.onLog(t3);
  }
};
var jt = {
  Undefined: 0,
  B44A: 1,
  B44: 2,
  BZip: 3,
  DXT1: 4,
  DXT3: 5,
  DXT5: 6,
  Fax: 7,
  Group4: 8,
  JBIG1: 9,
  JBIG2: 10,
  JPEG2000: 11,
  JPEG: 12,
  LosslessJPEG: 13,
  LZMA: 14,
  LZW: 15,
  NoCompression: 16,
  Piz: 17,
  Pxr24: 18,
  RLE: 19,
  Zip: 20,
  ZipS: 21,
  Zstd: 22,
  WebP: 23,
  DWAA: 24,
  DWAB: 25,
  BC7: 26,
  BC5: 27
};
var Lt = {
  Undefined: 0,
  NoInterlace: 1,
  Line: 2,
  Plane: 3,
  Partition: 4,
  Gif: 5,
  Jpeg: 6,
  Png: 7
};
var Vt = {
  Undefined: 0,
  TopLeft: 1,
  TopRight: 2,
  BottomRight: 3,
  BottomLeft: 4,
  LeftTop: 5,
  RightTop: 6,
  RightBottom: 7,
  LeftBottom: 8
};
var Xt = class e29 {
  _colorSpace = _.Undefined;
  _compression = jt.Undefined;
  _density = new _e(0, 0);
  _format = Ae.Unknown;
  _height = 0;
  _interlace = Lt.Undefined;
  _orientation = Vt.Undefined;
  _quality = 0;
  _width = 0;
  get colorSpace() {
    return this._colorSpace;
  }
  get compression() {
    return this._compression;
  }
  get density() {
    return this._density;
  }
  get format() {
    return this._format;
  }
  get height() {
    return this._height;
  }
  get interlace() {
    return this._interlace;
  }
  get orientation() {
    return this._orientation;
  }
  get quality() {
    return this._quality;
  }
  get width() {
    return this._width;
  }
  constructor() {
  }
  read(e30, t3) {
    R._create((n2) => {
      n2.ping(e30, t3), this._colorSpace = n2.colorSpace, this._compression = n2.compression, this._density = n2.density, this._format = n2.format, this._height = n2.height, this._interlace = n2.interlace, this._orientation = n2.orientation, this._quality = n2.quality, this._width = n2.width;
    });
  }
  static create(t3, n2) {
    let r2 = new e29();
    return r2.read(t3, n2), r2;
  }
};
var Zt = class {
  static get area() {
    return V._api._ResourceLimits_Area_Get();
  }
  static set area(e30) {
    V._api._ResourceLimits_Area_Set(e30);
  }
  static get disk() {
    return V._api._ResourceLimits_Disk_Get();
  }
  static set disk(e30) {
    V._api._ResourceLimits_Disk_Set(e30);
  }
  static get height() {
    return V._api._ResourceLimits_Height_Get();
  }
  static set height(e30) {
    V._api._ResourceLimits_Height_Set(e30);
  }
  static get listLength() {
    return V._api._ResourceLimits_ListLength_Get();
  }
  static set listLength(e30) {
    V._api._ResourceLimits_ListLength_Set(e30);
  }
  static get maxMemoryRequest() {
    return V._api._ResourceLimits_MaxMemoryRequest_Get();
  }
  static set maxMemoryRequest(e30) {
    j.usePointer((t3) => {
      V._api._ResourceLimits_MaxMemoryRequest_Set(e30, t3);
    });
  }
  static get maxProfileSize() {
    return V._api._ResourceLimits_MaxProfileSize_Get();
  }
  static set maxProfileSize(e30) {
    j.usePointer((t3) => {
      V._api._ResourceLimits_MaxProfileSize_Set(e30, t3);
    });
  }
  static get memory() {
    return V._api._ResourceLimits_Memory_Get();
  }
  static set memory(e30) {
    V._api._ResourceLimits_Memory_Set(e30);
  }
  static get time() {
    return V._api._ResourceLimits_Time_Get();
  }
  static set time(e30) {
    V._api._ResourceLimits_Time_Set(e30);
  }
  static get width() {
    return V._api._ResourceLimits_Width_Get();
  }
  static set width(e30) {
    V._api._ResourceLimits_Width_Set(e30);
  }
};

// src/presets/grok/image-worker.mjs
try {
  const bytes = Buffer.from(workerData.bytes);
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw Error("Image exceeds the 50 MiB input limit.");
  const bmp = bytes[0] === 66 && bytes[1] === 77;
  const ico = bytes.length >= 6 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1 && bytes.readUInt16LE(4) > 0;
  if (!bmp && !ico) throw Error("Bundled image decoder accepts only BMP or ICO bytes.");
  const config = r.default;
  config.policy.data = '<policymap><policy domain="delegate" rights="none" pattern="*"/><policy domain="filter" rights="none" pattern="*"/><policy domain="coder" rights="none" pattern="*"/><policy domain="coder" rights="read|write" pattern="{BMP,BMP2,BMP3,ICO,ICON,PNG}"/></policymap>';
  await et(await readFile(new URL("./grok-magick.wasm", import.meta.url)), config);
  Zt.memory = 256n * 1024n * 1024n;
  Zt.disk = 0n;
  Zt.area = 16000000n;
  Zt.width = 16000000n;
  Zt.height = 16000000n;
  Zt.maxMemoryRequest = 256n * 1024n * 1024n;
  Zt.maxProfileSize = 1024n * 1024n;
  Zt.time = 60n;
  const settings = new Fe({ format: bmp ? Ae.Bmp : Ae.Ico, frameIndex: 0, frameCount: 1 });
  const validate = (image) => {
    if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1 || image.width * image.height > 16e6) throw Error("BMP/ICO exceeds the 16000000-pixel decode limit.");
  };
  const info = new Xt();
  info.read(bytes, settings);
  validate(info);
  const value = V.read(bytes, settings, (image) => {
    validate(image);
    image.strip();
    image.depth = 8;
    return image.write(Ae.Png, (data) => {
      if (!data.length || data.length > 80 * 1024 * 1024) throw Error("Decoded PNG exceeds the output limit.");
      return Uint8Array.from(data);
    });
  });
  parentPort.postMessage({ value }, [value.buffer]);
} catch (error) {
  parentPort.postMessage({ error: String(error?.message ?? "Image conversion failed.").slice(0, 1024) });
}
