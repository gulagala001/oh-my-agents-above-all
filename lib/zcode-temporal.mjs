// Temporal polyfill 0.5.1 (ISC) + JSBI 4.3.2 (Apache-2.0); exact notices: src/presets/zcode/licenses/.
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../../omaa/node_modules/.pnpm/jsbi@4.3.2/node_modules/jsbi/dist/jsbi-cjs.js
var require_jsbi_cjs = __commonJS({
  "../../../../omaa/node_modules/.pnpm/jsbi@4.3.2/node_modules/jsbi/dist/jsbi-cjs.js"(exports, module) {
    "use strict";
    var JSBI = class _JSBI extends Array {
      constructor(i, _) {
        if (super(i), this.sign = _, Object.setPrototypeOf(this, _JSBI.prototype), i > _JSBI.__kMaxLength) throw new RangeError("Maximum BigInt size exceeded");
      }
      static BigInt(i) {
        var _ = Math.floor, t = Number.isFinite;
        if ("number" == typeof i) {
          if (0 === i) return _JSBI.__zero();
          if (_JSBI.__isOneDigitInt(i)) return 0 > i ? _JSBI.__oneDigit(-i, true) : _JSBI.__oneDigit(i, false);
          if (!t(i) || _(i) !== i) throw new RangeError("The number " + i + " cannot be converted to BigInt because it is not an integer");
          return _JSBI.__fromDouble(i);
        }
        if ("string" == typeof i) {
          const _2 = _JSBI.__fromString(i);
          if (null === _2) throw new SyntaxError("Cannot convert " + i + " to a BigInt");
          return _2;
        }
        if ("boolean" == typeof i) return true === i ? _JSBI.__oneDigit(1, false) : _JSBI.__zero();
        if ("object" == typeof i) {
          if (i.constructor === _JSBI) return i;
          const _2 = _JSBI.__toPrimitive(i);
          return _JSBI.BigInt(_2);
        }
        throw new TypeError("Cannot convert " + i + " to a BigInt");
      }
      toDebugString() {
        const i = ["BigInt["];
        for (const _ of this) i.push((_ ? (_ >>> 0).toString(16) : _) + ", ");
        return i.push("]"), i.join("");
      }
      toString(i = 10) {
        if (2 > i || 36 < i) throw new RangeError("toString() radix argument must be between 2 and 36");
        return 0 === this.length ? "0" : 0 == (i & i - 1) ? _JSBI.__toStringBasePowerOfTwo(this, i) : _JSBI.__toStringGeneric(this, i, false);
      }
      valueOf() {
        throw new Error("Convert JSBI instances to native numbers using `toNumber`.");
      }
      static toNumber(i) {
        const _ = i.length;
        if (0 === _) return 0;
        if (1 === _) {
          const _2 = i.__unsignedDigit(0);
          return i.sign ? -_2 : _2;
        }
        const t = i.__digit(_ - 1), e = _JSBI.__clz30(t), n = 30 * _ - e;
        if (1024 < n) return i.sign ? -Infinity : 1 / 0;
        let g = n - 1, o = t, s = _ - 1;
        const l = e + 3;
        let r = 32 === l ? 0 : o << l;
        r >>>= 12;
        const a = l - 12;
        let u = 12 <= l ? 0 : o << 20 + l, d = 20 + l;
        for (0 < a && 0 < s && (s--, o = i.__digit(s), r |= o >>> 30 - a, u = o << a + 2, d = a + 2); 0 < d && 0 < s; ) s--, o = i.__digit(s), u |= 30 <= d ? o << d - 30 : o >>> 30 - d, d -= 30;
        const h = _JSBI.__decideRounding(i, d, s, o);
        if ((1 === h || 0 === h && 1 == (1 & u)) && (u = u + 1 >>> 0, 0 === u && (r++, 0 != r >>> 20 && (r = 0, g++, 1023 < g)))) return i.sign ? -Infinity : 1 / 0;
        const m = i.sign ? -2147483648 : 0;
        return g = g + 1023 << 20, _JSBI.__kBitConversionInts[_JSBI.__kBitConversionIntHigh] = m | g | r, _JSBI.__kBitConversionInts[_JSBI.__kBitConversionIntLow] = u, _JSBI.__kBitConversionDouble[0];
      }
      static unaryMinus(i) {
        if (0 === i.length) return i;
        const _ = i.__copy();
        return _.sign = !i.sign, _;
      }
      static bitwiseNot(i) {
        return i.sign ? _JSBI.__absoluteSubOne(i).__trim() : _JSBI.__absoluteAddOne(i, true);
      }
      static exponentiate(i, _) {
        if (_.sign) throw new RangeError("Exponent must be positive");
        if (0 === _.length) return _JSBI.__oneDigit(1, false);
        if (0 === i.length) return i;
        if (1 === i.length && 1 === i.__digit(0)) return i.sign && 0 == (1 & _.__digit(0)) ? _JSBI.unaryMinus(i) : i;
        if (1 < _.length) throw new RangeError("BigInt too big");
        let t = _.__unsignedDigit(0);
        if (1 === t) return i;
        if (t >= _JSBI.__kMaxLengthBits) throw new RangeError("BigInt too big");
        if (1 === i.length && 2 === i.__digit(0)) {
          const _2 = 1 + (0 | t / 30), e2 = i.sign && 0 != (1 & t), n2 = new _JSBI(_2, e2);
          n2.__initializeDigits();
          const g = 1 << t % 30;
          return n2.__setDigit(_2 - 1, g), n2;
        }
        let e = null, n = i;
        for (0 != (1 & t) && (e = i), t >>= 1; 0 !== t; t >>= 1) n = _JSBI.multiply(n, n), 0 != (1 & t) && (null === e ? e = n : e = _JSBI.multiply(e, n));
        return e;
      }
      static multiply(_, t) {
        if (0 === _.length) return _;
        if (0 === t.length) return t;
        let i = _.length + t.length;
        30 <= _.__clzmsd() + t.__clzmsd() && i--;
        const e = new _JSBI(i, _.sign !== t.sign);
        e.__initializeDigits();
        for (let n = 0; n < _.length; n++) _JSBI.__multiplyAccumulate(t, _.__digit(n), e, n);
        return e.__trim();
      }
      static divide(i, _) {
        if (0 === _.length) throw new RangeError("Division by zero");
        if (0 > _JSBI.__absoluteCompare(i, _)) return _JSBI.__zero();
        const t = i.sign !== _.sign, e = _.__unsignedDigit(0);
        let n;
        if (1 === _.length && 32767 >= e) {
          if (1 === e) return t === i.sign ? i : _JSBI.unaryMinus(i);
          n = _JSBI.__absoluteDivSmall(i, e, null);
        } else n = _JSBI.__absoluteDivLarge(i, _, true, false);
        return n.sign = t, n.__trim();
      }
      static remainder(i, _) {
        if (0 === _.length) throw new RangeError("Division by zero");
        if (0 > _JSBI.__absoluteCompare(i, _)) return i;
        const t = _.__unsignedDigit(0);
        if (1 === _.length && 32767 >= t) {
          if (1 === t) return _JSBI.__zero();
          const _2 = _JSBI.__absoluteModSmall(i, t);
          return 0 === _2 ? _JSBI.__zero() : _JSBI.__oneDigit(_2, i.sign);
        }
        const e = _JSBI.__absoluteDivLarge(i, _, false, true);
        return e.sign = i.sign, e.__trim();
      }
      static add(i, _) {
        const t = i.sign;
        return t === _.sign ? _JSBI.__absoluteAdd(i, _, t) : 0 <= _JSBI.__absoluteCompare(i, _) ? _JSBI.__absoluteSub(i, _, t) : _JSBI.__absoluteSub(_, i, !t);
      }
      static subtract(i, _) {
        const t = i.sign;
        return t === _.sign ? 0 <= _JSBI.__absoluteCompare(i, _) ? _JSBI.__absoluteSub(i, _, t) : _JSBI.__absoluteSub(_, i, !t) : _JSBI.__absoluteAdd(i, _, t);
      }
      static leftShift(i, _) {
        return 0 === _.length || 0 === i.length ? i : _.sign ? _JSBI.__rightShiftByAbsolute(i, _) : _JSBI.__leftShiftByAbsolute(i, _);
      }
      static signedRightShift(i, _) {
        return 0 === _.length || 0 === i.length ? i : _.sign ? _JSBI.__leftShiftByAbsolute(i, _) : _JSBI.__rightShiftByAbsolute(i, _);
      }
      static unsignedRightShift() {
        throw new TypeError("BigInts have no unsigned right shift; use >> instead");
      }
      static lessThan(i, _) {
        return 0 > _JSBI.__compareToBigInt(i, _);
      }
      static lessThanOrEqual(i, _) {
        return 0 >= _JSBI.__compareToBigInt(i, _);
      }
      static greaterThan(i, _) {
        return 0 < _JSBI.__compareToBigInt(i, _);
      }
      static greaterThanOrEqual(i, _) {
        return 0 <= _JSBI.__compareToBigInt(i, _);
      }
      static equal(_, t) {
        if (_.sign !== t.sign) return false;
        if (_.length !== t.length) return false;
        for (let e = 0; e < _.length; e++) if (_.__digit(e) !== t.__digit(e)) return false;
        return true;
      }
      static notEqual(i, _) {
        return !_JSBI.equal(i, _);
      }
      static bitwiseAnd(i, _) {
        var t = Math.max;
        if (!i.sign && !_.sign) return _JSBI.__absoluteAnd(i, _).__trim();
        if (i.sign && _.sign) {
          const e = t(i.length, _.length) + 1;
          let n = _JSBI.__absoluteSubOne(i, e);
          const g = _JSBI.__absoluteSubOne(_);
          return n = _JSBI.__absoluteOr(n, g, n), _JSBI.__absoluteAddOne(n, true, n).__trim();
        }
        return i.sign && ([i, _] = [_, i]), _JSBI.__absoluteAndNot(i, _JSBI.__absoluteSubOne(_)).__trim();
      }
      static bitwiseXor(i, _) {
        var t = Math.max;
        if (!i.sign && !_.sign) return _JSBI.__absoluteXor(i, _).__trim();
        if (i.sign && _.sign) {
          const e2 = t(i.length, _.length), n2 = _JSBI.__absoluteSubOne(i, e2), g = _JSBI.__absoluteSubOne(_);
          return _JSBI.__absoluteXor(n2, g, n2).__trim();
        }
        const e = t(i.length, _.length) + 1;
        i.sign && ([i, _] = [_, i]);
        let n = _JSBI.__absoluteSubOne(_, e);
        return n = _JSBI.__absoluteXor(n, i, n), _JSBI.__absoluteAddOne(n, true, n).__trim();
      }
      static bitwiseOr(i, _) {
        var t = Math.max;
        const e = t(i.length, _.length);
        if (!i.sign && !_.sign) return _JSBI.__absoluteOr(i, _).__trim();
        if (i.sign && _.sign) {
          let t2 = _JSBI.__absoluteSubOne(i, e);
          const n2 = _JSBI.__absoluteSubOne(_);
          return t2 = _JSBI.__absoluteAnd(t2, n2, t2), _JSBI.__absoluteAddOne(t2, true, t2).__trim();
        }
        i.sign && ([i, _] = [_, i]);
        let n = _JSBI.__absoluteSubOne(_, e);
        return n = _JSBI.__absoluteAndNot(n, i, n), _JSBI.__absoluteAddOne(n, true, n).__trim();
      }
      static asIntN(_, t) {
        var i = Math.floor;
        if (0 === t.length) return t;
        if (_ = i(_), 0 > _) throw new RangeError("Invalid value: not (convertible to) a safe integer");
        if (0 === _) return _JSBI.__zero();
        if (_ >= _JSBI.__kMaxLengthBits) return t;
        const e = 0 | (_ + 29) / 30;
        if (t.length < e) return t;
        const g = t.__unsignedDigit(e - 1), o = 1 << (_ - 1) % 30;
        if (t.length === e && g < o) return t;
        if (!((g & o) === o)) return _JSBI.__truncateToNBits(_, t);
        if (!t.sign) return _JSBI.__truncateAndSubFromPowerOfTwo(_, t, true);
        if (0 == (g & o - 1)) {
          for (let n = e - 2; 0 <= n; n--) if (0 !== t.__digit(n)) return _JSBI.__truncateAndSubFromPowerOfTwo(_, t, false);
          return t.length === e && g === o ? t : _JSBI.__truncateToNBits(_, t);
        }
        return _JSBI.__truncateAndSubFromPowerOfTwo(_, t, false);
      }
      static asUintN(i, _) {
        var t = Math.floor;
        if (0 === _.length) return _;
        if (i = t(i), 0 > i) throw new RangeError("Invalid value: not (convertible to) a safe integer");
        if (0 === i) return _JSBI.__zero();
        if (_.sign) {
          if (i > _JSBI.__kMaxLengthBits) throw new RangeError("BigInt too big");
          return _JSBI.__truncateAndSubFromPowerOfTwo(i, _, false);
        }
        if (i >= _JSBI.__kMaxLengthBits) return _;
        const e = 0 | (i + 29) / 30;
        if (_.length < e) return _;
        const g = i % 30;
        if (_.length == e) {
          if (0 === g) return _;
          const i2 = _.__digit(e - 1);
          if (0 == i2 >>> g) return _;
        }
        return _JSBI.__truncateToNBits(i, _);
      }
      static ADD(i, _) {
        if (i = _JSBI.__toPrimitive(i), _ = _JSBI.__toPrimitive(_), "string" == typeof i) return "string" != typeof _ && (_ = _.toString()), i + _;
        if ("string" == typeof _) return i.toString() + _;
        if (i = _JSBI.__toNumeric(i), _ = _JSBI.__toNumeric(_), _JSBI.__isBigInt(i) && _JSBI.__isBigInt(_)) return _JSBI.add(i, _);
        if ("number" == typeof i && "number" == typeof _) return i + _;
        throw new TypeError("Cannot mix BigInt and other types, use explicit conversions");
      }
      static LT(i, _) {
        return _JSBI.__compare(i, _, 0);
      }
      static LE(i, _) {
        return _JSBI.__compare(i, _, 1);
      }
      static GT(i, _) {
        return _JSBI.__compare(i, _, 2);
      }
      static GE(i, _) {
        return _JSBI.__compare(i, _, 3);
      }
      static EQ(i, _) {
        for (; ; ) {
          if (_JSBI.__isBigInt(i)) return _JSBI.__isBigInt(_) ? _JSBI.equal(i, _) : _JSBI.EQ(_, i);
          if ("number" == typeof i) {
            if (_JSBI.__isBigInt(_)) return _JSBI.__equalToNumber(_, i);
            if ("object" != typeof _) return i == _;
            _ = _JSBI.__toPrimitive(_);
          } else if ("string" == typeof i) {
            if (_JSBI.__isBigInt(_)) return i = _JSBI.__fromString(i), null !== i && _JSBI.equal(i, _);
            if ("object" != typeof _) return i == _;
            _ = _JSBI.__toPrimitive(_);
          } else if ("boolean" == typeof i) {
            if (_JSBI.__isBigInt(_)) return _JSBI.__equalToNumber(_, +i);
            if ("object" != typeof _) return i == _;
            _ = _JSBI.__toPrimitive(_);
          } else if ("symbol" == typeof i) {
            if (_JSBI.__isBigInt(_)) return false;
            if ("object" != typeof _) return i == _;
            _ = _JSBI.__toPrimitive(_);
          } else if ("object" == typeof i) {
            if ("object" == typeof _ && _.constructor !== _JSBI) return i == _;
            i = _JSBI.__toPrimitive(i);
          } else return i == _;
        }
      }
      static NE(i, _) {
        return !_JSBI.EQ(i, _);
      }
      static DataViewGetBigInt64(i, _, t = false) {
        return _JSBI.asIntN(64, _JSBI.DataViewGetBigUint64(i, _, t));
      }
      static DataViewGetBigUint64(i, _, t = false) {
        const [e, n] = t ? [4, 0] : [0, 4], g = i.getUint32(_ + e, t), o = i.getUint32(_ + n, t), s = new _JSBI(3, false);
        return s.__setDigit(0, 1073741823 & o), s.__setDigit(1, (268435455 & g) << 2 | o >>> 30), s.__setDigit(2, g >>> 28), s.__trim();
      }
      static DataViewSetBigInt64(i, _, t, e = false) {
        _JSBI.DataViewSetBigUint64(i, _, t, e);
      }
      static DataViewSetBigUint64(i, _, t, e = false) {
        t = _JSBI.asUintN(64, t);
        let n = 0, g = 0;
        if (0 < t.length && (g = t.__digit(0), 1 < t.length)) {
          const i2 = t.__digit(1);
          g |= i2 << 30, n = i2 >>> 2, 2 < t.length && (n |= t.__digit(2) << 28);
        }
        const [o, s] = e ? [4, 0] : [0, 4];
        i.setUint32(_ + o, n, e), i.setUint32(_ + s, g, e);
      }
      static __zero() {
        return new _JSBI(0, false);
      }
      static __oneDigit(i, _) {
        const t = new _JSBI(1, _);
        return t.__setDigit(0, i), t;
      }
      __copy() {
        const _ = new _JSBI(this.length, this.sign);
        for (let t = 0; t < this.length; t++) _[t] = this[t];
        return _;
      }
      __trim() {
        let i = this.length, _ = this[i - 1];
        for (; 0 === _; ) i--, _ = this[i - 1], this.pop();
        return 0 === i && (this.sign = false), this;
      }
      __initializeDigits() {
        for (let _ = 0; _ < this.length; _++) this[_] = 0;
      }
      static __decideRounding(i, _, t, e) {
        if (0 < _) return -1;
        let n;
        if (0 > _) n = -_ - 1;
        else {
          if (0 === t) return -1;
          t--, e = i.__digit(t), n = 29;
        }
        let g = 1 << n;
        if (0 == (e & g)) return -1;
        if (g -= 1, 0 != (e & g)) return 1;
        for (; 0 < t; ) if (t--, 0 !== i.__digit(t)) return 1;
        return 0;
      }
      static __fromDouble(i) {
        _JSBI.__kBitConversionDouble[0] = i;
        const _ = 2047 & _JSBI.__kBitConversionInts[_JSBI.__kBitConversionIntHigh] >>> 20, t = _ - 1023, e = (0 | t / 30) + 1, n = new _JSBI(e, 0 > i);
        let g = 1048575 & _JSBI.__kBitConversionInts[_JSBI.__kBitConversionIntHigh] | 1048576, o = _JSBI.__kBitConversionInts[_JSBI.__kBitConversionIntLow];
        const s = 20, l = t % 30;
        let r, a = 0;
        if (l < 20) {
          const i2 = s - l;
          a = i2 + 32, r = g >>> i2, g = g << 32 - i2 | o >>> i2, o <<= 32 - i2;
        } else if (l === 20) a = 32, r = g, g = o, o = 0;
        else {
          const i2 = l - s;
          a = 32 - i2, r = g << i2 | o >>> 32 - i2, g = o << i2, o = 0;
        }
        n.__setDigit(e - 1, r);
        for (let _2 = e - 2; 0 <= _2; _2--) 0 < a ? (a -= 30, r = g >>> 2, g = g << 30 | o >>> 2, o <<= 30) : r = 0, n.__setDigit(_2, r);
        return n.__trim();
      }
      static __isWhitespace(i) {
        return !!(13 >= i && 9 <= i) || (159 >= i ? 32 == i : 131071 >= i ? 160 == i || 5760 == i : 196607 >= i ? (i &= 131071, 10 >= i || 40 == i || 41 == i || 47 == i || 95 == i || 4096 == i) : 65279 == i);
      }
      static __fromString(i, _ = 0) {
        let t = 0;
        const e = i.length;
        let n = 0;
        if (n === e) return _JSBI.__zero();
        let g = i.charCodeAt(n);
        for (; _JSBI.__isWhitespace(g); ) {
          if (++n === e) return _JSBI.__zero();
          g = i.charCodeAt(n);
        }
        if (43 === g) {
          if (++n === e) return null;
          g = i.charCodeAt(n), t = 1;
        } else if (45 === g) {
          if (++n === e) return null;
          g = i.charCodeAt(n), t = -1;
        }
        if (0 === _) {
          if (_ = 10, 48 === g) {
            if (++n === e) return _JSBI.__zero();
            if (g = i.charCodeAt(n), 88 === g || 120 === g) {
              if (_ = 16, ++n === e) return null;
              g = i.charCodeAt(n);
            } else if (79 === g || 111 === g) {
              if (_ = 8, ++n === e) return null;
              g = i.charCodeAt(n);
            } else if (66 === g || 98 === g) {
              if (_ = 2, ++n === e) return null;
              g = i.charCodeAt(n);
            }
          }
        } else if (16 === _ && 48 === g) {
          if (++n === e) return _JSBI.__zero();
          if (g = i.charCodeAt(n), 88 === g || 120 === g) {
            if (++n === e) return null;
            g = i.charCodeAt(n);
          }
        }
        if (0 != t && 10 !== _) return null;
        for (; 48 === g; ) {
          if (++n === e) return _JSBI.__zero();
          g = i.charCodeAt(n);
        }
        const o = e - n;
        let s = _JSBI.__kMaxBitsPerChar[_], l = _JSBI.__kBitsPerCharTableMultiplier - 1;
        if (o > 1073741824 / s) return null;
        const r = s * o + l >>> _JSBI.__kBitsPerCharTableShift, a = new _JSBI(0 | (r + 29) / 30, false), u = 10 > _ ? _ : 10, h = 10 < _ ? _ - 10 : 0;
        if (0 == (_ & _ - 1)) {
          s >>= _JSBI.__kBitsPerCharTableShift;
          const _2 = [], t2 = [];
          let o2 = false;
          do {
            let l2 = 0, r2 = 0;
            for (; ; ) {
              let _3;
              if (g - 48 >>> 0 < u) _3 = g - 48;
              else if ((32 | g) - 97 >>> 0 < h) _3 = (32 | g) - 87;
              else {
                o2 = true;
                break;
              }
              if (r2 += s, l2 = l2 << s | _3, ++n === e) {
                o2 = true;
                break;
              }
              if (g = i.charCodeAt(n), 30 < r2 + s) break;
            }
            _2.push(l2), t2.push(r2);
          } while (!o2);
          _JSBI.__fillFromParts(a, _2, t2);
        } else {
          a.__initializeDigits();
          let t2 = false, o2 = 0;
          do {
            let r2 = 0, b = 1;
            for (; ; ) {
              let s2;
              if (g - 48 >>> 0 < u) s2 = g - 48;
              else if ((32 | g) - 97 >>> 0 < h) s2 = (32 | g) - 87;
              else {
                t2 = true;
                break;
              }
              const l2 = b * _;
              if (1073741823 < l2) break;
              if (b = l2, r2 = r2 * _ + s2, o2++, ++n === e) {
                t2 = true;
                break;
              }
              g = i.charCodeAt(n);
            }
            l = 30 * _JSBI.__kBitsPerCharTableMultiplier - 1;
            const D = 0 | (s * o2 + l >>> _JSBI.__kBitsPerCharTableShift) / 30;
            a.__inplaceMultiplyAdd(b, r2, D);
          } while (!t2);
        }
        if (n !== e) {
          if (!_JSBI.__isWhitespace(g)) return null;
          for (n++; n < e; n++) if (g = i.charCodeAt(n), !_JSBI.__isWhitespace(g)) return null;
        }
        return a.sign = -1 == t, a.__trim();
      }
      static __fillFromParts(_, t, e) {
        let n = 0, g = 0, o = 0;
        for (let s = t.length - 1; 0 <= s; s--) {
          const i = t[s], l = e[s];
          g |= i << o, o += l, 30 === o ? (_.__setDigit(n++, g), o = 0, g = 0) : 30 < o && (_.__setDigit(n++, 1073741823 & g), o -= 30, g = i >>> l - o);
        }
        if (0 !== g) {
          if (n >= _.length) throw new Error("implementation bug");
          _.__setDigit(n++, g);
        }
        for (; n < _.length; n++) _.__setDigit(n, 0);
      }
      static __toStringBasePowerOfTwo(_, i) {
        const t = _.length;
        let e = i - 1;
        e = (85 & e >>> 1) + (85 & e), e = (51 & e >>> 2) + (51 & e), e = (15 & e >>> 4) + (15 & e);
        const n = e, g = i - 1, o = _.__digit(t - 1), s = _JSBI.__clz30(o);
        let l = 0 | (30 * t - s + n - 1) / n;
        if (_.sign && l++, 268435456 < l) throw new Error("string too long");
        const r = Array(l);
        let a = l - 1, u = 0, d = 0;
        for (let e2 = 0; e2 < t - 1; e2++) {
          const i2 = _.__digit(e2), t2 = (u | i2 << d) & g;
          r[a--] = _JSBI.__kConversionChars[t2];
          const o2 = n - d;
          for (u = i2 >>> o2, d = 30 - o2; d >= n; ) r[a--] = _JSBI.__kConversionChars[u & g], u >>>= n, d -= n;
        }
        const h = (u | o << d) & g;
        for (r[a--] = _JSBI.__kConversionChars[h], u = o >>> n - d; 0 !== u; ) r[a--] = _JSBI.__kConversionChars[u & g], u >>>= n;
        if (_.sign && (r[a--] = "-"), -1 != a) throw new Error("implementation bug");
        return r.join("");
      }
      static __toStringGeneric(_, i, t) {
        const e = _.length;
        if (0 === e) return "";
        if (1 === e) {
          let e2 = _.__unsignedDigit(0).toString(i);
          return false === t && _.sign && (e2 = "-" + e2), e2;
        }
        const n = 30 * e - _JSBI.__clz30(_.__digit(e - 1)), g = _JSBI.__kMaxBitsPerChar[i], o = g - 1;
        let s = n * _JSBI.__kBitsPerCharTableMultiplier;
        s += o - 1, s = 0 | s / o;
        const l = s + 1 >> 1, r = _JSBI.exponentiate(_JSBI.__oneDigit(i, false), _JSBI.__oneDigit(l, false));
        let a, u;
        const d = r.__unsignedDigit(0);
        if (1 === r.length && 32767 >= d) {
          a = new _JSBI(_.length, false), a.__initializeDigits();
          let t2 = 0;
          for (let e2 = 2 * _.length - 1; 0 <= e2; e2--) {
            const i2 = t2 << 15 | _.__halfDigit(e2);
            a.__setHalfDigit(e2, 0 | i2 / d), t2 = 0 | i2 % d;
          }
          u = t2.toString(i);
        } else {
          const t2 = _JSBI.__absoluteDivLarge(_, r, true, true);
          a = t2.quotient;
          const e2 = t2.remainder.__trim();
          u = _JSBI.__toStringGeneric(e2, i, true);
        }
        a.__trim();
        let h = _JSBI.__toStringGeneric(a, i, true);
        for (; u.length < l; ) u = "0" + u;
        return false === t && _.sign && (h = "-" + h), h + u;
      }
      static __unequalSign(i) {
        return i ? -1 : 1;
      }
      static __absoluteGreater(i) {
        return i ? -1 : 1;
      }
      static __absoluteLess(i) {
        return i ? 1 : -1;
      }
      static __compareToBigInt(i, _) {
        const t = i.sign;
        if (t !== _.sign) return _JSBI.__unequalSign(t);
        const e = _JSBI.__absoluteCompare(i, _);
        return 0 < e ? _JSBI.__absoluteGreater(t) : 0 > e ? _JSBI.__absoluteLess(t) : 0;
      }
      static __compareToNumber(i, _) {
        if (_JSBI.__isOneDigitInt(_)) {
          const t = i.sign, e = 0 > _;
          if (t !== e) return _JSBI.__unequalSign(t);
          if (0 === i.length) {
            if (e) throw new Error("implementation bug");
            return 0 === _ ? 0 : -1;
          }
          if (1 < i.length) return _JSBI.__absoluteGreater(t);
          const n = Math.abs(_), g = i.__unsignedDigit(0);
          return g > n ? _JSBI.__absoluteGreater(t) : g < n ? _JSBI.__absoluteLess(t) : 0;
        }
        return _JSBI.__compareToDouble(i, _);
      }
      static __compareToDouble(i, _) {
        if (_ !== _) return _;
        if (_ === 1 / 0) return -1;
        if (_ === -Infinity) return 1;
        const t = i.sign;
        if (t !== 0 > _) return _JSBI.__unequalSign(t);
        if (0 === _) throw new Error("implementation bug: should be handled elsewhere");
        if (0 === i.length) return -1;
        _JSBI.__kBitConversionDouble[0] = _;
        const e = 2047 & _JSBI.__kBitConversionInts[_JSBI.__kBitConversionIntHigh] >>> 20;
        if (2047 == e) throw new Error("implementation bug: handled elsewhere");
        const n = e - 1023;
        if (0 > n) return _JSBI.__absoluteGreater(t);
        const g = i.length;
        let o = i.__digit(g - 1);
        const s = _JSBI.__clz30(o), l = 30 * g - s, r = n + 1;
        if (l < r) return _JSBI.__absoluteLess(t);
        if (l > r) return _JSBI.__absoluteGreater(t);
        let a = 1048576 | 1048575 & _JSBI.__kBitConversionInts[_JSBI.__kBitConversionIntHigh], u = _JSBI.__kBitConversionInts[_JSBI.__kBitConversionIntLow];
        const d = 20, h = 29 - s;
        if (h !== (0 | (l - 1) % 30)) throw new Error("implementation bug");
        let m, b = 0;
        if (20 > h) {
          const i2 = d - h;
          b = i2 + 32, m = a >>> i2, a = a << 32 - i2 | u >>> i2, u <<= 32 - i2;
        } else if (20 === h) b = 32, m = a, a = u, u = 0;
        else {
          const i2 = h - d;
          b = 32 - i2, m = a << i2 | u >>> 32 - i2, a = u << i2, u = 0;
        }
        if (o >>>= 0, m >>>= 0, o > m) return _JSBI.__absoluteGreater(t);
        if (o < m) return _JSBI.__absoluteLess(t);
        for (let e2 = g - 2; 0 <= e2; e2--) {
          0 < b ? (b -= 30, m = a >>> 2, a = a << 30 | u >>> 2, u <<= 30) : m = 0;
          const _2 = i.__unsignedDigit(e2);
          if (_2 > m) return _JSBI.__absoluteGreater(t);
          if (_2 < m) return _JSBI.__absoluteLess(t);
        }
        if (0 !== a || 0 !== u) {
          if (0 === b) throw new Error("implementation bug");
          return _JSBI.__absoluteLess(t);
        }
        return 0;
      }
      static __equalToNumber(i, _) {
        var t = Math.abs;
        return _JSBI.__isOneDigitInt(_) ? 0 === _ ? 0 === i.length : 1 === i.length && i.sign === 0 > _ && i.__unsignedDigit(0) === t(_) : 0 === _JSBI.__compareToDouble(i, _);
      }
      static __comparisonResultToBool(i, _) {
        return 0 === _ ? 0 > i : 1 === _ ? 0 >= i : 2 === _ ? 0 < i : 3 === _ ? 0 <= i : void 0;
      }
      static __compare(i, _, t) {
        if (i = _JSBI.__toPrimitive(i), _ = _JSBI.__toPrimitive(_), "string" == typeof i && "string" == typeof _) switch (t) {
          case 0:
            return i < _;
          case 1:
            return i <= _;
          case 2:
            return i > _;
          case 3:
            return i >= _;
        }
        if (_JSBI.__isBigInt(i) && "string" == typeof _) return _ = _JSBI.__fromString(_), null !== _ && _JSBI.__comparisonResultToBool(_JSBI.__compareToBigInt(i, _), t);
        if ("string" == typeof i && _JSBI.__isBigInt(_)) return i = _JSBI.__fromString(i), null !== i && _JSBI.__comparisonResultToBool(_JSBI.__compareToBigInt(i, _), t);
        if (i = _JSBI.__toNumeric(i), _ = _JSBI.__toNumeric(_), _JSBI.__isBigInt(i)) {
          if (_JSBI.__isBigInt(_)) return _JSBI.__comparisonResultToBool(_JSBI.__compareToBigInt(i, _), t);
          if ("number" != typeof _) throw new Error("implementation bug");
          return _JSBI.__comparisonResultToBool(_JSBI.__compareToNumber(i, _), t);
        }
        if ("number" != typeof i) throw new Error("implementation bug");
        if (_JSBI.__isBigInt(_)) return _JSBI.__comparisonResultToBool(_JSBI.__compareToNumber(_, i), 2 ^ t);
        if ("number" != typeof _) throw new Error("implementation bug");
        return 0 === t ? i < _ : 1 === t ? i <= _ : 2 === t ? i > _ : 3 === t ? i >= _ : void 0;
      }
      __clzmsd() {
        return _JSBI.__clz30(this.__digit(this.length - 1));
      }
      static __absoluteAdd(_, t, e) {
        if (_.length < t.length) return _JSBI.__absoluteAdd(t, _, e);
        if (0 === _.length) return _;
        if (0 === t.length) return _.sign === e ? _ : _JSBI.unaryMinus(_);
        let n = _.length;
        (0 === _.__clzmsd() || t.length === _.length && 0 === t.__clzmsd()) && n++;
        const g = new _JSBI(n, e);
        let o = 0, s = 0;
        for (; s < t.length; s++) {
          const i = _.__digit(s) + t.__digit(s) + o;
          o = i >>> 30, g.__setDigit(s, 1073741823 & i);
        }
        for (; s < _.length; s++) {
          const i = _.__digit(s) + o;
          o = i >>> 30, g.__setDigit(s, 1073741823 & i);
        }
        return s < g.length && g.__setDigit(s, o), g.__trim();
      }
      static __absoluteSub(_, t, e) {
        if (0 === _.length) return _;
        if (0 === t.length) return _.sign === e ? _ : _JSBI.unaryMinus(_);
        const n = new _JSBI(_.length, e);
        let g = 0, o = 0;
        for (; o < t.length; o++) {
          const i = _.__digit(o) - t.__digit(o) - g;
          g = 1 & i >>> 30, n.__setDigit(o, 1073741823 & i);
        }
        for (; o < _.length; o++) {
          const i = _.__digit(o) - g;
          g = 1 & i >>> 30, n.__setDigit(o, 1073741823 & i);
        }
        return n.__trim();
      }
      static __absoluteAddOne(_, i, t = null) {
        const e = _.length;
        null === t ? t = new _JSBI(e, i) : t.sign = i;
        let n = 1;
        for (let g = 0; g < e; g++) {
          const i2 = _.__digit(g) + n;
          n = i2 >>> 30, t.__setDigit(g, 1073741823 & i2);
        }
        return 0 != n && t.__setDigitGrow(e, 1), t;
      }
      static __absoluteSubOne(_, t) {
        const e = _.length;
        t = t || e;
        const n = new _JSBI(t, false);
        let g = 1;
        for (let o = 0; o < e; o++) {
          const i = _.__digit(o) - g;
          g = 1 & i >>> 30, n.__setDigit(o, 1073741823 & i);
        }
        if (0 != g) throw new Error("implementation bug");
        for (let g2 = e; g2 < t; g2++) n.__setDigit(g2, 0);
        return n;
      }
      static __absoluteAnd(_, t, e = null) {
        let n = _.length, g = t.length, o = g;
        if (n < g) {
          o = n;
          const i = _, e2 = n;
          _ = t, n = g, t = i, g = e2;
        }
        let s = o;
        null === e ? e = new _JSBI(s, false) : s = e.length;
        let l = 0;
        for (; l < o; l++) e.__setDigit(l, _.__digit(l) & t.__digit(l));
        for (; l < s; l++) e.__setDigit(l, 0);
        return e;
      }
      static __absoluteAndNot(_, t, e = null) {
        const n = _.length, g = t.length;
        let o = g;
        n < g && (o = n);
        let s = n;
        null === e ? e = new _JSBI(s, false) : s = e.length;
        let l = 0;
        for (; l < o; l++) e.__setDigit(l, _.__digit(l) & ~t.__digit(l));
        for (; l < n; l++) e.__setDigit(l, _.__digit(l));
        for (; l < s; l++) e.__setDigit(l, 0);
        return e;
      }
      static __absoluteOr(_, t, e = null) {
        let n = _.length, g = t.length, o = g;
        if (n < g) {
          o = n;
          const i = _, e2 = n;
          _ = t, n = g, t = i, g = e2;
        }
        let s = n;
        null === e ? e = new _JSBI(s, false) : s = e.length;
        let l = 0;
        for (; l < o; l++) e.__setDigit(l, _.__digit(l) | t.__digit(l));
        for (; l < n; l++) e.__setDigit(l, _.__digit(l));
        for (; l < s; l++) e.__setDigit(l, 0);
        return e;
      }
      static __absoluteXor(_, t, e = null) {
        let n = _.length, g = t.length, o = g;
        if (n < g) {
          o = n;
          const i = _, e2 = n;
          _ = t, n = g, t = i, g = e2;
        }
        let s = n;
        null === e ? e = new _JSBI(s, false) : s = e.length;
        let l = 0;
        for (; l < o; l++) e.__setDigit(l, _.__digit(l) ^ t.__digit(l));
        for (; l < n; l++) e.__setDigit(l, _.__digit(l));
        for (; l < s; l++) e.__setDigit(l, 0);
        return e;
      }
      static __absoluteCompare(_, t) {
        const e = _.length - t.length;
        if (0 != e) return e;
        let n = _.length - 1;
        for (; 0 <= n && _.__digit(n) === t.__digit(n); ) n--;
        return 0 > n ? 0 : _.__unsignedDigit(n) > t.__unsignedDigit(n) ? 1 : -1;
      }
      static __multiplyAccumulate(_, t, e, n) {
        if (0 === t) return;
        const g = 32767 & t, o = t >>> 15;
        let s = 0, l = 0;
        for (let r, a = 0; a < _.length; a++, n++) {
          r = e.__digit(n);
          const i = _.__digit(a), t2 = 32767 & i, u = i >>> 15, d = _JSBI.__imul(t2, g), h = _JSBI.__imul(t2, o), m = _JSBI.__imul(u, g), b = _JSBI.__imul(u, o);
          r += l + d + s, s = r >>> 30, r &= 1073741823, r += ((32767 & h) << 15) + ((32767 & m) << 15), s += r >>> 30, l = b + (h >>> 15) + (m >>> 15), e.__setDigit(n, 1073741823 & r);
        }
        for (; 0 != s || 0 !== l; n++) {
          let i = e.__digit(n);
          i += s + l, l = 0, s = i >>> 30, e.__setDigit(n, 1073741823 & i);
        }
      }
      static __internalMultiplyAdd(_, t, e, g, o) {
        let s = e, l = 0;
        for (let n = 0; n < g; n++) {
          const i = _.__digit(n), e2 = _JSBI.__imul(32767 & i, t), g2 = _JSBI.__imul(i >>> 15, t), a = e2 + ((32767 & g2) << 15) + l + s;
          s = a >>> 30, l = g2 >>> 15, o.__setDigit(n, 1073741823 & a);
        }
        if (o.length > g) for (o.__setDigit(g++, s + l); g < o.length; ) o.__setDigit(g++, 0);
        else if (0 !== s + l) throw new Error("implementation bug");
      }
      __inplaceMultiplyAdd(i, _, t) {
        t > this.length && (t = this.length);
        const e = 32767 & i, n = i >>> 15;
        let g = 0, o = _;
        for (let s = 0; s < t; s++) {
          const i2 = this.__digit(s), _2 = 32767 & i2, t2 = i2 >>> 15, l = _JSBI.__imul(_2, e), r = _JSBI.__imul(_2, n), a = _JSBI.__imul(t2, e), u = _JSBI.__imul(t2, n);
          let d = o + l + g;
          g = d >>> 30, d &= 1073741823, d += ((32767 & r) << 15) + ((32767 & a) << 15), g += d >>> 30, o = u + (r >>> 15) + (a >>> 15), this.__setDigit(s, 1073741823 & d);
        }
        if (0 != g || 0 !== o) throw new Error("implementation bug");
      }
      static __absoluteDivSmall(_, t, e = null) {
        null === e && (e = new _JSBI(_.length, false));
        let n = 0;
        for (let g, o = 2 * _.length - 1; 0 <= o; o -= 2) {
          g = (n << 15 | _.__halfDigit(o)) >>> 0;
          const i = 0 | g / t;
          n = 0 | g % t, g = (n << 15 | _.__halfDigit(o - 1)) >>> 0;
          const s = 0 | g / t;
          n = 0 | g % t, e.__setDigit(o >>> 1, i << 15 | s);
        }
        return e;
      }
      static __absoluteModSmall(_, t) {
        let e = 0;
        for (let n = 2 * _.length - 1; 0 <= n; n--) {
          const i = (e << 15 | _.__halfDigit(n)) >>> 0;
          e = 0 | i % t;
        }
        return e;
      }
      static __absoluteDivLarge(i, _, t, e) {
        const g = _.__halfDigitLength(), n = _.length, o = i.__halfDigitLength() - g;
        let s = null;
        t && (s = new _JSBI(o + 2 >>> 1, false), s.__initializeDigits());
        const l = new _JSBI(g + 2 >>> 1, false);
        l.__initializeDigits();
        const r = _JSBI.__clz15(_.__halfDigit(g - 1));
        0 < r && (_ = _JSBI.__specialLeftShift(_, r, 0));
        const a = _JSBI.__specialLeftShift(i, r, 1), u = _.__halfDigit(g - 1);
        let d = 0;
        for (let r2, h = o; 0 <= h; h--) {
          r2 = 32767;
          const i2 = a.__halfDigit(h + g);
          if (i2 !== u) {
            const t2 = (i2 << 15 | a.__halfDigit(h + g - 1)) >>> 0;
            r2 = 0 | t2 / u;
            let e3 = 0 | t2 % u;
            const n2 = _.__halfDigit(g - 2), o2 = a.__halfDigit(h + g - 2);
            for (; _JSBI.__imul(r2, n2) >>> 0 > (e3 << 16 | o2) >>> 0 && (r2--, e3 += u, !(32767 < e3)); ) ;
          }
          _JSBI.__internalMultiplyAdd(_, r2, 0, n, l);
          let e2 = a.__inplaceSub(l, h, g + 1);
          0 !== e2 && (e2 = a.__inplaceAdd(_, h, g), a.__setHalfDigit(h + g, 32767 & a.__halfDigit(h + g) + e2), r2--), t && (1 & h ? d = r2 << 15 : s.__setDigit(h >>> 1, d | r2));
        }
        if (e) return a.__inplaceRightShift(r), t ? { quotient: s, remainder: a } : a;
        if (t) return s;
        throw new Error("unreachable");
      }
      static __clz15(i) {
        return _JSBI.__clz30(i) - 15;
      }
      __inplaceAdd(_, t, e) {
        let n = 0;
        for (let g = 0; g < e; g++) {
          const i = this.__halfDigit(t + g) + _.__halfDigit(g) + n;
          n = i >>> 15, this.__setHalfDigit(t + g, 32767 & i);
        }
        return n;
      }
      __inplaceSub(_, t, e) {
        let n = 0;
        if (1 & t) {
          t >>= 1;
          let g = this.__digit(t), o = 32767 & g, s = 0;
          for (; s < e - 1 >>> 1; s++) {
            const i2 = _.__digit(s), e2 = (g >>> 15) - (32767 & i2) - n;
            n = 1 & e2 >>> 15, this.__setDigit(t + s, (32767 & e2) << 15 | 32767 & o), g = this.__digit(t + s + 1), o = (32767 & g) - (i2 >>> 15) - n, n = 1 & o >>> 15;
          }
          const i = _.__digit(s), l = (g >>> 15) - (32767 & i) - n;
          n = 1 & l >>> 15, this.__setDigit(t + s, (32767 & l) << 15 | 32767 & o);
          if (t + s + 1 >= this.length) throw new RangeError("out of bounds");
          0 == (1 & e) && (g = this.__digit(t + s + 1), o = (32767 & g) - (i >>> 15) - n, n = 1 & o >>> 15, this.__setDigit(t + _.length, 1073709056 & g | 32767 & o));
        } else {
          t >>= 1;
          let g = 0;
          for (; g < _.length - 1; g++) {
            const i2 = this.__digit(t + g), e2 = _.__digit(g), o2 = (32767 & i2) - (32767 & e2) - n;
            n = 1 & o2 >>> 15;
            const s2 = (i2 >>> 15) - (e2 >>> 15) - n;
            n = 1 & s2 >>> 15, this.__setDigit(t + g, (32767 & s2) << 15 | 32767 & o2);
          }
          const i = this.__digit(t + g), o = _.__digit(g), s = (32767 & i) - (32767 & o) - n;
          n = 1 & s >>> 15;
          let l = 0;
          0 == (1 & e) && (l = (i >>> 15) - (o >>> 15) - n, n = 1 & l >>> 15), this.__setDigit(t + g, (32767 & l) << 15 | 32767 & s);
        }
        return n;
      }
      __inplaceRightShift(_) {
        if (0 === _) return;
        let t = this.__digit(0) >>> _;
        const e = this.length - 1;
        for (let n = 0; n < e; n++) {
          const i = this.__digit(n + 1);
          this.__setDigit(n, 1073741823 & i << 30 - _ | t), t = i >>> _;
        }
        this.__setDigit(e, t);
      }
      static __specialLeftShift(_, t, e) {
        const g = _.length, n = new _JSBI(g + e, false);
        if (0 === t) {
          for (let t2 = 0; t2 < g; t2++) n.__setDigit(t2, _.__digit(t2));
          return 0 < e && n.__setDigit(g, 0), n;
        }
        let o = 0;
        for (let s = 0; s < g; s++) {
          const i = _.__digit(s);
          n.__setDigit(s, 1073741823 & i << t | o), o = i >>> 30 - t;
        }
        return 0 < e && n.__setDigit(g, o), n;
      }
      static __leftShiftByAbsolute(_, i) {
        const t = _JSBI.__toShiftAmount(i);
        if (0 > t) throw new RangeError("BigInt too big");
        const e = 0 | t / 30, n = t % 30, g = _.length, o = 0 !== n && 0 != _.__digit(g - 1) >>> 30 - n, s = g + e + (o ? 1 : 0), l = new _JSBI(s, _.sign);
        if (0 === n) {
          let t2 = 0;
          for (; t2 < e; t2++) l.__setDigit(t2, 0);
          for (; t2 < s; t2++) l.__setDigit(t2, _.__digit(t2 - e));
        } else {
          let t2 = 0;
          for (let _2 = 0; _2 < e; _2++) l.__setDigit(_2, 0);
          for (let o2 = 0; o2 < g; o2++) {
            const i2 = _.__digit(o2);
            l.__setDigit(o2 + e, 1073741823 & i2 << n | t2), t2 = i2 >>> 30 - n;
          }
          if (o) l.__setDigit(g + e, t2);
          else if (0 !== t2) throw new Error("implementation bug");
        }
        return l.__trim();
      }
      static __rightShiftByAbsolute(_, i) {
        const t = _.length, e = _.sign, n = _JSBI.__toShiftAmount(i);
        if (0 > n) return _JSBI.__rightShiftByMaximum(e);
        const g = 0 | n / 30, o = n % 30;
        let s = t - g;
        if (0 >= s) return _JSBI.__rightShiftByMaximum(e);
        let l = false;
        if (e) {
          if (0 != (_.__digit(g) & (1 << o) - 1)) l = true;
          else for (let t2 = 0; t2 < g; t2++) if (0 !== _.__digit(t2)) {
            l = true;
            break;
          }
        }
        if (l && 0 === o) {
          const i2 = _.__digit(t - 1);
          0 == ~i2 && s++;
        }
        let r = new _JSBI(s, e);
        if (0 === o) {
          r.__setDigit(s - 1, 0);
          for (let e2 = g; e2 < t; e2++) r.__setDigit(e2 - g, _.__digit(e2));
        } else {
          let e2 = _.__digit(g) >>> o;
          const n2 = t - g - 1;
          for (let t2 = 0; t2 < n2; t2++) {
            const i2 = _.__digit(t2 + g + 1);
            r.__setDigit(t2, 1073741823 & i2 << 30 - o | e2), e2 = i2 >>> o;
          }
          r.__setDigit(n2, e2);
        }
        return l && (r = _JSBI.__absoluteAddOne(r, true, r)), r.__trim();
      }
      static __rightShiftByMaximum(i) {
        return i ? _JSBI.__oneDigit(1, true) : _JSBI.__zero();
      }
      static __toShiftAmount(i) {
        if (1 < i.length) return -1;
        const _ = i.__unsignedDigit(0);
        return _ > _JSBI.__kMaxLengthBits ? -1 : _;
      }
      static __toPrimitive(i, _ = "default") {
        if ("object" != typeof i) return i;
        if (i.constructor === _JSBI) return i;
        if ("undefined" != typeof Symbol && "symbol" == typeof Symbol.toPrimitive && i[Symbol.toPrimitive]) {
          const t2 = i[Symbol.toPrimitive](_);
          if ("object" != typeof t2) return t2;
          throw new TypeError("Cannot convert object to primitive value");
        }
        const t = i.valueOf;
        if (t) {
          const _2 = t.call(i);
          if ("object" != typeof _2) return _2;
        }
        const e = i.toString;
        if (e) {
          const _2 = e.call(i);
          if ("object" != typeof _2) return _2;
        }
        throw new TypeError("Cannot convert object to primitive value");
      }
      static __toNumeric(i) {
        return _JSBI.__isBigInt(i) ? i : +i;
      }
      static __isBigInt(i) {
        return "object" == typeof i && null !== i && i.constructor === _JSBI;
      }
      static __truncateToNBits(i, _) {
        const t = 0 | (i + 29) / 30, e = new _JSBI(t, _.sign), n = t - 1;
        for (let t2 = 0; t2 < n; t2++) e.__setDigit(t2, _.__digit(t2));
        let g = _.__digit(n);
        if (0 != i % 30) {
          const _2 = 32 - i % 30;
          g = g << _2 >>> _2;
        }
        return e.__setDigit(n, g), e.__trim();
      }
      static __truncateAndSubFromPowerOfTwo(_, t, e) {
        var n = Math.min;
        const g = 0 | (_ + 29) / 30, o = new _JSBI(g, e);
        let s = 0;
        const l = g - 1;
        let a = 0;
        for (const i = n(l, t.length); s < i; s++) {
          const i2 = 0 - t.__digit(s) - a;
          a = 1 & i2 >>> 30, o.__setDigit(s, 1073741823 & i2);
        }
        for (; s < l; s++) o.__setDigit(s, 0 | 1073741823 & -a);
        let u = l < t.length ? t.__digit(l) : 0;
        const d = _ % 30;
        let h;
        if (0 == d) h = 0 - u - a, h &= 1073741823;
        else {
          const i = 32 - d;
          u = u << i >>> i;
          const _2 = 1 << 32 - i;
          h = _2 - u - a, h &= _2 - 1;
        }
        return o.__setDigit(l, h), o.__trim();
      }
      __digit(_) {
        return this[_];
      }
      __unsignedDigit(_) {
        return this[_] >>> 0;
      }
      __setDigit(_, i) {
        this[_] = 0 | i;
      }
      __setDigitGrow(_, i) {
        this[_] = 0 | i;
      }
      __halfDigitLength() {
        const i = this.length;
        return 32767 >= this.__unsignedDigit(i - 1) ? 2 * i - 1 : 2 * i;
      }
      __halfDigit(_) {
        return 32767 & this[_ >>> 1] >>> 15 * (1 & _);
      }
      __setHalfDigit(_, i) {
        const t = _ >>> 1, e = this.__digit(t), n = 1 & _ ? 32767 & e | i << 15 : 1073709056 & e | 32767 & i;
        this.__setDigit(t, n);
      }
      static __digitPow(i, _) {
        let t = 1;
        for (; 0 < _; ) 1 & _ && (t *= i), _ >>>= 1, i *= i;
        return t;
      }
      static __detectBigEndian() {
        return _JSBI.__kBitConversionDouble[0] = -0, 0 !== _JSBI.__kBitConversionInts[0];
      }
      static __isOneDigitInt(i) {
        return (1073741823 & i) === i;
      }
    };
    JSBI.__kMaxLength = 33554432, JSBI.__kMaxLengthBits = JSBI.__kMaxLength << 5, JSBI.__kMaxBitsPerChar = [0, 0, 32, 51, 64, 75, 83, 90, 96, 102, 107, 111, 115, 119, 122, 126, 128, 131, 134, 136, 139, 141, 143, 145, 147, 149, 151, 153, 154, 156, 158, 159, 160, 162, 163, 165, 166], JSBI.__kBitsPerCharTableShift = 5, JSBI.__kBitsPerCharTableMultiplier = 1 << JSBI.__kBitsPerCharTableShift, JSBI.__kConversionChars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"], JSBI.__kBitConversionBuffer = new ArrayBuffer(8), JSBI.__kBitConversionDouble = new Float64Array(JSBI.__kBitConversionBuffer), JSBI.__kBitConversionInts = new Int32Array(JSBI.__kBitConversionBuffer), JSBI.__kBitConversionIntHigh = JSBI.__detectBigEndian() ? 0 : 1, JSBI.__kBitConversionIntLow = JSBI.__detectBigEndian() ? 1 : 0, JSBI.__clz30 = Math.clz32 ? function(i) {
      return Math.clz32(i) - 2;
    } : function(i) {
      return 0 === i ? 30 : 0 | 29 - (0 | Math.log(i >>> 0) / Math.LN2);
    }, JSBI.__imul = Math.imul || function(i, _) {
      return 0 | i * _;
    }, module.exports = JSBI;
  }
});

// ../../../../omaa/node_modules/.pnpm/@js-temporal+polyfill@0.5.1/node_modules/@js-temporal/polyfill/dist/index.cjs
var require_dist = __commonJS({
  "../../../../omaa/node_modules/.pnpm/@js-temporal+polyfill@0.5.1/node_modules/@js-temporal/polyfill/dist/index.cjs"(exports) {
    "use strict";
    var e = require_jsbi_cjs();
    var t = e.BigInt(0);
    var n = e.BigInt(1);
    var r = e.BigInt(2);
    var o = e.BigInt(10);
    var i = e.BigInt(24);
    var a = e.BigInt(60);
    var s = e.BigInt(1e3);
    var c = e.BigInt(1e6);
    var d = e.BigInt(1e9);
    var h = e.multiply(e.BigInt(3600), d);
    var u = e.multiply(a, d);
    var l = e.multiply(h, i);
    function m(t2) {
      return "bigint" == typeof t2 ? e.BigInt(t2.toString(10)) : t2;
    }
    function f(n2) {
      return e.equal(e.remainder(n2, r), t);
    }
    function y(n2) {
      return e.lessThan(n2, t) ? e.unaryMinus(n2) : n2;
    }
    function p(t2, n2) {
      return e.lessThan(t2, n2) ? -1 : e.greaterThan(t2, n2) ? 1 : 0;
    }
    function g(t2, n2) {
      return { quotient: e.divide(t2, n2), remainder: e.remainder(t2, n2) };
    }
    var w;
    var v;
    var b = "slot-epochNanoSeconds";
    var D = "slot-iso-date";
    var T = "slot-iso-date-time";
    var M = "slot-time";
    var E = "slot-calendar";
    var I = "slot-date-brand";
    var C = "slot-year-month-brand";
    var O = "slot-month-day-brand";
    var $ = "slot-time-zone";
    var Y = "slot-years";
    var R = "slot-months";
    var S = "slot-weeks";
    var j = "slot-days";
    var k = "slot-hours";
    var N = "slot-minutes";
    var x = "slot-seconds";
    var L = "slot-milliseconds";
    var P = "slot-microseconds";
    var U = "slot-nanoseconds";
    var B = "date";
    var Z = "ym";
    var F = "md";
    var H = "time";
    var z = "datetime";
    var A = "instant";
    var q = "original";
    var W = "timezone-canonical";
    var _ = "timezone-original";
    var J = "calendar-id";
    var G = "locale";
    var K = "options";
    var V = /* @__PURE__ */ new WeakMap();
    var X = Symbol.for("@@Temporal__GetSlots");
    (w = globalThis)[X] || (w[X] = function(e2) {
      return V.get(e2);
    });
    var Q = globalThis[X];
    var ee = Symbol.for("@@Temporal__CreateSlots");
    (v = globalThis)[ee] || (v[ee] = function(e2) {
      V.set(e2, /* @__PURE__ */ Object.create(null));
    });
    var te = globalThis[ee];
    function ne(e2, ...t2) {
      if (!e2 || "object" != typeof e2) return false;
      const n2 = Q(e2);
      return !!n2 && t2.every(((e3) => e3 in n2));
    }
    function re(e2, t2) {
      const n2 = Q(e2)?.[t2];
      if (void 0 === n2) throw new TypeError(`Missing internal slot ${t2}`);
      return n2;
    }
    function oe(e2, t2, n2) {
      const r2 = Q(e2);
      if (void 0 === r2) throw new TypeError("Missing slots for the given container");
      if (r2[t2]) throw new TypeError(`${t2} already has set`);
      r2[t2] = n2;
    }
    var ie = {};
    function ae(e2, t2) {
      Object.defineProperty(e2.prototype, Symbol.toStringTag, { value: t2, writable: false, enumerable: false, configurable: true });
      const n2 = Object.getOwnPropertyNames(e2);
      for (let t3 = 0; t3 < n2.length; t3++) {
        const r3 = n2[t3], o2 = Object.getOwnPropertyDescriptor(e2, r3);
        o2.configurable && o2.enumerable && (o2.enumerable = false, Object.defineProperty(e2, r3, o2));
      }
      const r2 = Object.getOwnPropertyNames(e2.prototype);
      for (let t3 = 0; t3 < r2.length; t3++) {
        const n3 = r2[t3], o2 = Object.getOwnPropertyDescriptor(e2.prototype, n3);
        o2.configurable && o2.enumerable && (o2.enumerable = false, Object.defineProperty(e2.prototype, n3, o2));
      }
      se(t2, e2), se(`${t2}.prototype`, e2.prototype);
    }
    function se(e2, t2) {
      const n2 = `%${e2}%`;
      if (void 0 !== ie[n2]) throw new Error(`intrinsic ${e2} already exists`);
      ie[n2] = t2;
    }
    function ce(e2) {
      return ie[e2];
    }
    function de(e2, t2) {
      let n2 = e2;
      if (0 === n2) return { div: n2, mod: n2 };
      const r2 = Math.sign(n2);
      n2 = Math.abs(n2);
      const o2 = Math.trunc(1 + Math.log10(n2));
      if (t2 >= o2) return { div: 0 * r2, mod: r2 * n2 };
      if (0 === t2) return { div: r2 * n2, mod: 0 * r2 };
      const i2 = n2.toPrecision(o2);
      return { div: r2 * Number.parseInt(i2.slice(0, o2 - t2), 10), mod: r2 * Number.parseInt(i2.slice(o2 - t2), 10) };
    }
    function he(e2, t2, n2) {
      let r2 = e2, o2 = n2;
      if (0 === r2) return o2;
      const i2 = Math.sign(r2) || Math.sign(o2);
      r2 = Math.abs(r2), o2 = Math.abs(o2);
      const a2 = r2.toPrecision(Math.trunc(1 + Math.log10(r2)));
      if (0 === o2) return i2 * Number.parseInt(a2 + "0".repeat(t2), 10);
      const s2 = a2 + o2.toPrecision(Math.trunc(1 + Math.log10(o2))).padStart(t2, "0");
      return i2 * Number.parseInt(s2, 10);
    }
    function ue(e2, t2) {
      const n2 = "negative" === t2;
      switch (e2) {
        case "ceil":
          return n2 ? "zero" : "infinity";
        case "floor":
          return n2 ? "infinity" : "zero";
        case "expand":
          return "infinity";
        case "trunc":
          return "zero";
        case "halfCeil":
          return n2 ? "half-zero" : "half-infinity";
        case "halfFloor":
          return n2 ? "half-infinity" : "half-zero";
        case "halfExpand":
          return "half-infinity";
        case "halfTrunc":
          return "half-zero";
        case "halfEven":
          return "half-even";
      }
    }
    function le(e2, t2, n2, r2, o2) {
      return "zero" === o2 ? e2 : "infinity" === o2 ? t2 : n2 < 0 ? e2 : n2 > 0 ? t2 : "half-zero" === o2 ? e2 : "half-infinity" === o2 ? t2 : r2 ? e2 : t2;
    }
    var TimeDuration = class _TimeDuration {
      constructor(t2) {
        this.totalNs = m(t2), this.sec = e.toNumber(e.divide(this.totalNs, d)), this.subsec = e.toNumber(e.remainder(this.totalNs, d));
      }
      static validateNew(t2, n2) {
        if (e.greaterThan(y(t2), _TimeDuration.MAX)) throw new RangeError(`${n2} of duration time units cannot exceed ${_TimeDuration.MAX} s`);
        return new _TimeDuration(t2);
      }
      static fromEpochNsDiff(t2, n2) {
        const r2 = e.subtract(m(t2), m(n2));
        return new _TimeDuration(r2);
      }
      static fromComponents(t2, n2, r2, o2, i2, a2) {
        const l2 = e.add(e.add(e.add(e.add(e.add(e.BigInt(a2), e.multiply(e.BigInt(i2), s)), e.multiply(e.BigInt(o2), c)), e.multiply(e.BigInt(r2), d)), e.multiply(e.BigInt(n2), u)), e.multiply(e.BigInt(t2), h));
        return _TimeDuration.validateNew(l2, "total");
      }
      abs() {
        return new _TimeDuration(y(this.totalNs));
      }
      add(t2) {
        return _TimeDuration.validateNew(e.add(this.totalNs, t2.totalNs), "sum");
      }
      add24HourDays(t2) {
        return _TimeDuration.validateNew(e.add(this.totalNs, e.multiply(e.BigInt(t2), l)), "sum");
      }
      addToEpochNs(t2) {
        return e.add(m(t2), this.totalNs);
      }
      cmp(e2) {
        return p(this.totalNs, e2.totalNs);
      }
      divmod(t2) {
        const { quotient: n2, remainder: r2 } = g(this.totalNs, e.BigInt(t2));
        return { quotient: e.toNumber(n2), remainder: new _TimeDuration(r2) };
      }
      fdiv(n2) {
        const r2 = m(n2), i2 = e.BigInt(r2);
        let { quotient: a2, remainder: s2 } = g(this.totalNs, i2);
        const c2 = [];
        let d2;
        const h2 = (e.lessThan(this.totalNs, t) ? -1 : 1) * Math.sign(e.toNumber(r2));
        for (; !e.equal(s2, t) && c2.length < 50; ) s2 = e.multiply(s2, o), { quotient: d2, remainder: s2 } = g(s2, i2), c2.push(Math.abs(e.toNumber(d2)));
        return h2 * Number(y(a2).toString() + "." + c2.join(""));
      }
      isZero() {
        return e.equal(this.totalNs, t);
      }
      round(o2, i2) {
        const a2 = m(o2);
        if (e.equal(a2, n)) return this;
        const { quotient: s2, remainder: c2 } = g(this.totalNs, a2), d2 = e.lessThan(this.totalNs, t) ? "negative" : "positive", h2 = e.multiply(y(s2), a2), u2 = e.add(h2, a2), l2 = p(y(e.multiply(c2, r)), a2), w2 = ue(i2, d2), v2 = e.equal(y(this.totalNs), h2) ? h2 : le(h2, u2, l2, f(s2), w2), b2 = "positive" === d2 ? v2 : e.unaryMinus(v2);
        return _TimeDuration.validateNew(b2, "rounding");
      }
      sign() {
        return this.cmp(new _TimeDuration(t));
      }
      subtract(t2) {
        return _TimeDuration.validateNew(e.subtract(this.totalNs, t2.totalNs), "difference");
      }
    };
    TimeDuration.MAX = e.BigInt("9007199254740991999999999"), TimeDuration.ZERO = new TimeDuration(t);
    var me = /[A-Za-z._][A-Za-z._0-9+-]*/;
    var fe = new RegExp(`(?:${/(?:[+-](?:[01][0-9]|2[0-3])(?::?[0-5][0-9])?)/.source}|(?:${me.source})(?:\\/(?:${me.source}))*)`);
    var ye = /(?:[+-]\d{6}|\d{4})/;
    var pe = /(?:0[1-9]|1[0-2])/;
    var ge = /(?:0[1-9]|[12]\d|3[01])/;
    var we = new RegExp(`(${ye.source})(?:-(${pe.source})-(${ge.source})|(${pe.source})(${ge.source}))`);
    var ve = /(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?|(\d{2})(?:(\d{2})(?:[.,](\d{1,9}))?)?)?/;
    var be = /((?:[+-])(?:[01][0-9]|2[0-3])(?::?(?:[0-5][0-9])(?::?(?:[0-5][0-9])(?:[.,](?:\d{1,9}))?)?)?)/;
    var De = new RegExp(`([zZ])|${be.source}?`);
    var Te = /\[(!)?([a-z_][a-z0-9_-]*)=([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\]/g;
    var Me = new RegExp([`^${we.source}`, `(?:(?:[tT]|\\s+)${ve.source}(?:${De.source})?)?`, `(?:\\[!?(${fe.source})\\])?`, `((?:${Te.source})*)$`].join(""));
    var Ee = new RegExp([`^[tT]?${ve.source}`, `(?:${De.source})?`, `(?:\\[!?${fe.source}\\])?`, `((?:${Te.source})*)$`].join(""));
    var Ie = new RegExp(`^(${ye.source})-?(${pe.source})(?:\\[!?${fe.source}\\])?((?:${Te.source})*)$`);
    var Ce = new RegExp(`^(?:--)?(${pe.source})-?(${ge.source})(?:\\[!?${fe.source}\\])?((?:${Te.source})*)$`);
    var Oe = /(\d+)(?:[.,](\d{1,9}))?/;
    var $e = new RegExp(`(?:${Oe.source}H)?(?:${Oe.source}M)?(?:${Oe.source}S)?`);
    var Ye = new RegExp(`^([+-])?P${/(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?/.source}(?:T(?!$)${$e.source})?$`, "i");
    var Re = 864e5;
    var Se = 1e6 * Re;
    var je = 6e10;
    var ke = 1e8 * Re;
    var Ne = xo(ke);
    var xe = e.unaryMinus(Ne);
    var Le = e.add(e.subtract(xe, l), n);
    var Pe = e.subtract(e.add(Ne, l), n);
    var Ue = 146097 * Re;
    var Be = -271821;
    var Ze = 275760;
    var Fe = Date.UTC(1847, 0, 1);
    var He = ["iso8601", "hebrew", "islamic", "islamic-umalqura", "islamic-tbla", "islamic-civil", "islamic-rgsa", "islamicc", "persian", "ethiopic", "ethioaa", "ethiopic-amete-alem", "coptic", "chinese", "dangi", "roc", "indian", "buddhist", "japanese", "gregory"];
    var ze = /* @__PURE__ */ new Set(["ACT", "AET", "AGT", "ART", "AST", "BET", "BST", "CAT", "CNT", "CST", "CTT", "EAT", "ECT", "IET", "IST", "JST", "MIT", "NET", "NST", "PLT", "PNT", "PRT", "PST", "SST", "VST"]);
    function Ae(e2) {
      return "object" == typeof e2 && null !== e2 || "function" == typeof e2;
    }
    function qe(e2) {
      if ("bigint" == typeof e2) throw new TypeError("Cannot convert BigInt to number");
      return Number(e2);
    }
    function We(e2) {
      if ("symbol" == typeof e2) throw new TypeError("Cannot convert a Symbol value to a String");
      return String(e2);
    }
    function _e(e2) {
      const t2 = qe(e2);
      if (0 === t2) return 0;
      if (Number.isNaN(t2) || t2 === 1 / 0 || t2 === -1 / 0) throw new RangeError("invalid number value");
      const n2 = Math.trunc(t2);
      return 0 === n2 ? 0 : n2;
    }
    function Je(e2, t2) {
      const n2 = _e(e2);
      if (n2 <= 0) {
        if (void 0 !== t2) throw new RangeError(`property '${t2}' cannot be a a number less than one`);
        throw new RangeError("Cannot convert a number less than one to a positive integer");
      }
      return n2;
    }
    function Ge(e2) {
      const t2 = qe(e2);
      if (Number.isNaN(t2)) throw new RangeError("not a number");
      if (t2 === 1 / 0 || t2 === -1 / 0) throw new RangeError("infinity is out of range");
      if (!(function(e3) {
        if ("number" != typeof e3 || Number.isNaN(e3) || e3 === 1 / 0 || e3 === -1 / 0) return false;
        const t3 = Math.abs(e3);
        return Math.floor(t3) === t3;
      })(t2)) throw new RangeError(`unsupported fractional value ${e2}`);
      return 0 === t2 ? 0 : t2;
    }
    function Ke(e2, t2) {
      return String(e2).padStart(t2, "0");
    }
    function Ve(e2) {
      if ("string" != typeof e2) throw new TypeError(`expected a string, not ${String(e2)}`);
      return e2;
    }
    function Xe(e2, t2) {
      if (Ae(e2)) {
        const t3 = e2?.toString();
        if ("string" == typeof t3 || "number" == typeof t3) return t3;
        throw new TypeError("Cannot convert object to primitive value");
      }
      return e2;
    }
    var Qe = ["era", "eraYear", "year", "month", "monthCode", "day", "hour", "minute", "second", "millisecond", "microsecond", "nanosecond", "offset", "timeZone"];
    var et = { era: We, eraYear: _e, year: _e, month: Je, monthCode: function(e2) {
      const t2 = Ve(Xe(e2));
      if (t2.length < 3 || t2.length > 4 || "M" !== t2[0] || -1 === "0123456789".indexOf(t2[1]) || -1 === "0123456789".indexOf(t2[2]) || t2[1] + t2[2] === "00" && "L" !== t2[3] || "L" !== t2[3] && void 0 !== t2[3]) throw new RangeError(`bad month code ${t2}; must match M01-M99 or M00L-M99L`);
      return t2;
    }, day: Je, hour: _e, minute: _e, second: _e, millisecond: _e, microsecond: _e, nanosecond: _e, offset: function(e2) {
      const t2 = Ve(Xe(e2));
      return sr(t2), t2;
    }, timeZone: Bn };
    var tt = { hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 };
    var nt = [["years", "year", "date"], ["months", "month", "date"], ["weeks", "week", "date"], ["days", "day", "date"], ["hours", "hour", "time"], ["minutes", "minute", "time"], ["seconds", "second", "time"], ["milliseconds", "millisecond", "time"], ["microseconds", "microsecond", "time"], ["nanoseconds", "nanosecond", "time"]];
    var rt = Object.fromEntries(nt.map(((e2) => [e2[0], e2[1]])));
    var ot = Object.fromEntries(nt.map((([e2, t2]) => [t2, e2])));
    var it = nt.map((([, e2]) => e2));
    var at = { day: Se, hour: 36e11, minute: 6e10, second: 1e9, millisecond: 1e6, microsecond: 1e3, nanosecond: 1 };
    var st = ["days", "hours", "microseconds", "milliseconds", "minutes", "months", "nanoseconds", "seconds", "weeks", "years"];
    var ct = Intl.DateTimeFormat;
    var dt = /* @__PURE__ */ new Map();
    function ht(e2) {
      const t2 = Ao(e2);
      let n2 = dt.get(t2);
      return void 0 === n2 && (n2 = new ct("en-us", { timeZone: t2, hour12: false, era: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }), dt.set(t2, n2)), n2;
    }
    function ut(e2) {
      return ne(e2, b) && !ne(e2, $, E);
    }
    function lt(e2) {
      return ne(e2, Y, R, j, k, N, x, L, P, U);
    }
    function mt(e2) {
      return ne(e2, I);
    }
    function ft(e2) {
      return ne(e2, M);
    }
    function yt(e2) {
      return ne(e2, T);
    }
    function pt(e2) {
      return ne(e2, C);
    }
    function gt(e2) {
      return ne(e2, O);
    }
    function wt(e2) {
      return ne(e2, b, $, E);
    }
    function vt(e2, t2) {
      if (!t2(e2)) throw new TypeError("invalid receiver: method called with the wrong type of this-object");
    }
    function bt(e2) {
      if (ne(e2, E) || ne(e2, $)) throw new TypeError("with() does not support a calendar or timeZone property");
      if (ft(e2)) throw new TypeError("with() does not accept Temporal.PlainTime, use withPlainTime() instead");
      if (void 0 !== e2.calendar) throw new TypeError("with() does not support a calendar property");
      if (void 0 !== e2.timeZone) throw new TypeError("with() does not support a timeZone property");
    }
    function Dt(e2, t2) {
      return "never" === t2 || "auto" === t2 && "iso8601" === e2 ? "" : `[${"critical" === t2 ? "!" : ""}u-ca=${e2}]`;
    }
    function Tt(e2) {
      let t2, n2, r2 = false;
      for (Te.lastIndex = 0; n2 = Te.exec(e2); ) {
        const { 1: o2, 2: i2, 3: a2 } = n2;
        if ("u-ca" === i2) {
          if (void 0 === t2) t2 = a2, r2 = "!" === o2;
          else if ("!" === o2 || r2) throw new RangeError(`Invalid annotations in ${e2}: more than one u-ca present with critical flag`);
        } else if ("!" === o2) throw new RangeError(`Unrecognized annotation: !${i2}=${a2}`);
      }
      return t2;
    }
    function Mt(e2) {
      const t2 = Me.exec(e2);
      if (!t2) throw new RangeError(`invalid RFC 9557 string: ${e2}`);
      const n2 = Tt(t2[16]);
      let r2 = t2[1];
      if ("-000000" === r2) throw new RangeError(`invalid RFC 9557 string: ${e2}`);
      const o2 = +r2, i2 = +(t2[2] ?? t2[4] ?? 1), a2 = +(t2[3] ?? t2[5] ?? 1), s2 = void 0 !== t2[6], c2 = +(t2[6] ?? 0), d2 = +(t2[7] ?? t2[10] ?? 0);
      let h2 = +(t2[8] ?? t2[11] ?? 0);
      60 === h2 && (h2 = 59);
      const u2 = (t2[9] ?? t2[12] ?? "") + "000000000", l2 = +u2.slice(0, 3), m2 = +u2.slice(3, 6), f2 = +u2.slice(6, 9);
      let y2, p2 = false;
      t2[13] ? (y2 = void 0, p2 = true) : t2[14] && (y2 = t2[14]);
      const g2 = t2[15];
      return Ur(o2, i2, a2, c2, d2, h2, l2, m2, f2), { year: o2, month: i2, day: a2, time: s2 ? { hour: c2, minute: d2, second: h2, millisecond: l2, microsecond: m2, nanosecond: f2 } : "start-of-day", tzAnnotation: g2, offset: y2, z: p2, calendar: n2 };
    }
    function Et(e2) {
      const t2 = Ee.exec(e2);
      let n2, r2, o2, i2, a2, s2, c2;
      if (t2) {
        c2 = Tt(t2[10]), n2 = +(t2[1] ?? 0), r2 = +(t2[2] ?? t2[5] ?? 0), o2 = +(t2[3] ?? t2[6] ?? 0), 60 === o2 && (o2 = 59);
        const e3 = (t2[4] ?? t2[7] ?? "") + "000000000";
        if (i2 = +e3.slice(0, 3), a2 = +e3.slice(3, 6), s2 = +e3.slice(6, 9), t2[8]) throw new RangeError("Z designator not supported for PlainTime");
      } else {
        let t3, d2;
        if ({ time: t3, z: d2, calendar: c2 } = Mt(e2), "start-of-day" === t3) throw new RangeError(`time is missing in string: ${e2}`);
        if (d2) throw new RangeError("Z designator not supported for PlainTime");
        ({ hour: n2, minute: r2, second: o2, millisecond: i2, microsecond: a2, nanosecond: s2 } = t3);
      }
      if (Pr(n2, r2, o2, i2, a2, s2), /[tT ][0-9][0-9]/.test(e2)) return { hour: n2, minute: r2, second: o2, millisecond: i2, microsecond: a2, nanosecond: s2, calendar: c2 };
      try {
        const { month: t3, day: n3 } = Ct(e2);
        xr(1972, t3, n3);
      } catch {
        try {
          const { year: t3, month: n3 } = It(e2);
          xr(t3, n3, 1);
        } catch {
          return { hour: n2, minute: r2, second: o2, millisecond: i2, microsecond: a2, nanosecond: s2, calendar: c2 };
        }
      }
      throw new RangeError(`invalid RFC 9557 time-only string ${e2}; may need a T prefix`);
    }
    function It(e2) {
      const t2 = Ie.exec(e2);
      let n2, r2, o2, i2;
      if (t2) {
        o2 = Tt(t2[3]);
        let a2 = t2[1];
        if ("-000000" === a2) throw new RangeError(`invalid RFC 9557 string: ${e2}`);
        if (n2 = +a2, r2 = +t2[2], i2 = 1, void 0 !== o2 && "iso8601" !== o2) throw new RangeError("YYYY-MM format is only valid with iso8601 calendar");
      } else {
        let t3;
        if ({ year: n2, month: r2, calendar: o2, day: i2, z: t3 } = Mt(e2), t3) throw new RangeError("Z designator not supported for PlainYearMonth");
      }
      return { year: n2, month: r2, calendar: o2, referenceISODay: i2 };
    }
    function Ct(e2) {
      const t2 = Ce.exec(e2);
      let n2, r2, o2, i2;
      if (t2) {
        if (o2 = Tt(t2[3]), n2 = +t2[1], r2 = +t2[2], void 0 !== o2 && "iso8601" !== o2) throw new RangeError("MM-DD format is only valid with iso8601 calendar");
      } else {
        let t3;
        if ({ month: n2, day: r2, calendar: o2, year: i2, z: t3 } = Mt(e2), t3) throw new RangeError("Z designator not supported for PlainMonthDay");
      }
      return { month: n2, day: r2, calendar: o2, referenceISOYear: i2 };
    }
    var Ot = new RegExp(`^${fe.source}$`, "i");
    var $t = new RegExp(`^${/([+-])([01][0-9]|2[0-3])(?::?([0-5][0-9])?)?/.source}$`);
    function Yt(e2) {
      const t2 = Wo.test(e2) ? "Seconds not allowed in offset time zone" : "Invalid time zone";
      throw new RangeError(`${t2}: ${e2}`);
    }
    function Rt(e2) {
      return Ot.test(e2) || Yt(e2), $t.test(e2) ? { offsetMinutes: sr(e2) / 6e10 } : { tzName: e2 };
    }
    function St(e2, t2, n2, r2) {
      let o2 = e2, i2 = t2, a2 = n2;
      switch (r2) {
        case "reject":
          xr(o2, i2, a2);
          break;
        case "constrain":
          ({ year: o2, month: i2, day: a2 } = kr(o2, i2, a2));
      }
      return { year: o2, month: i2, day: a2 };
    }
    function jt(e2, t2, n2, r2, o2, i2, a2) {
      let s2 = e2, c2 = t2, d2 = n2, h2 = r2, u2 = o2, l2 = i2;
      switch (a2) {
        case "reject":
          Pr(s2, c2, d2, h2, u2, l2);
          break;
        case "constrain":
          s2 = jr(s2, 0, 23), c2 = jr(c2, 0, 59), d2 = jr(d2, 0, 59), h2 = jr(h2, 0, 999), u2 = jr(u2, 0, 999), l2 = jr(l2, 0, 999);
      }
      return { hour: s2, minute: c2, second: d2, millisecond: h2, microsecond: u2, nanosecond: l2 };
    }
    function kt(e2) {
      if (!Ae(e2)) throw new TypeError("invalid duration-like");
      const t2 = { years: void 0, months: void 0, weeks: void 0, days: void 0, hours: void 0, minutes: void 0, seconds: void 0, milliseconds: void 0, microseconds: void 0, nanoseconds: void 0 };
      let n2 = false;
      for (let r2 = 0; r2 < st.length; r2++) {
        const o2 = st[r2], i2 = e2[o2];
        void 0 !== i2 && (n2 = true, t2[o2] = Ge(i2));
      }
      if (!n2) throw new TypeError("invalid duration-like");
      return t2;
    }
    function Nt({ years: e2, months: t2, weeks: n2, days: r2 }, o2, i2, a2) {
      return { years: e2, months: a2 ?? t2, weeks: i2 ?? n2, days: o2 ?? r2 };
    }
    function xt(e2, t2) {
      return { isoDate: e2, time: t2 };
    }
    function Lt(e2) {
      return Ho(e2, "overflow", ["constrain", "reject"], "constrain");
    }
    function Pt(e2) {
      return Ho(e2, "disambiguation", ["compatible", "earlier", "later", "reject"], "compatible");
    }
    function Ut(e2, t2) {
      return Ho(e2, "roundingMode", ["ceil", "floor", "expand", "trunc", "halfCeil", "halfFloor", "halfExpand", "halfTrunc", "halfEven"], t2);
    }
    function Bt(e2, t2) {
      return Ho(e2, "offset", ["prefer", "use", "ignore", "reject"], t2);
    }
    function Zt(e2) {
      return Ho(e2, "calendarName", ["auto", "always", "never", "critical"], "auto");
    }
    function Ft(e2) {
      let t2 = e2.roundingIncrement;
      if (void 0 === t2) return 1;
      const n2 = _e(t2);
      if (n2 < 1 || n2 > 1e9) throw new RangeError(`roundingIncrement must be at least 1 and at most 1e9, not ${t2}`);
      return n2;
    }
    function Ht(e2, t2, n2) {
      const r2 = n2 ? t2 : t2 - 1;
      if (e2 > r2) throw new RangeError(`roundingIncrement must be at least 1 and less than ${r2}, not ${e2}`);
      if (t2 % e2 != 0) throw new RangeError(`Rounding increment must divide evenly into ${t2}`);
    }
    function zt(e2) {
      const t2 = e2.fractionalSecondDigits;
      if (void 0 === t2) return "auto";
      if ("number" != typeof t2) {
        if ("auto" !== We(t2)) throw new RangeError(`fractionalSecondDigits must be 'auto' or 0 through 9, not ${t2}`);
        return "auto";
      }
      const n2 = Math.floor(t2);
      if (!Number.isFinite(n2) || n2 < 0 || n2 > 9) throw new RangeError(`fractionalSecondDigits must be 'auto' or 0 through 9, not ${t2}`);
      return n2;
    }
    function At(e2, t2) {
      switch (e2) {
        case "minute":
          return { precision: "minute", unit: "minute", increment: 1 };
        case "second":
          return { precision: 0, unit: "second", increment: 1 };
        case "millisecond":
          return { precision: 3, unit: "millisecond", increment: 1 };
        case "microsecond":
          return { precision: 6, unit: "microsecond", increment: 1 };
        case "nanosecond":
          return { precision: 9, unit: "nanosecond", increment: 1 };
      }
      switch (t2) {
        case "auto":
          return { precision: t2, unit: "nanosecond", increment: 1 };
        case 0:
          return { precision: t2, unit: "second", increment: 1 };
        case 1:
        case 2:
        case 3:
          return { precision: t2, unit: "millisecond", increment: 10 ** (3 - t2) };
        case 4:
        case 5:
        case 6:
          return { precision: t2, unit: "microsecond", increment: 10 ** (6 - t2) };
        case 7:
        case 8:
        case 9:
          return { precision: t2, unit: "nanosecond", increment: 10 ** (9 - t2) };
        default:
          throw new RangeError(`fractionalSecondDigits must be 'auto' or 0 through 9, not ${t2}`);
      }
    }
    var qt = Symbol("~required~");
    function Wt(e2, t2, n2, r2, o2 = []) {
      let i2 = [];
      for (let e3 = 0; e3 < nt.length; e3++) {
        const t3 = nt[e3], r3 = t3[1], o3 = t3[2];
        "datetime" !== n2 && n2 !== o3 || i2.push(r3);
      }
      i2 = i2.concat(o2);
      let a2 = r2;
      a2 === qt ? a2 = void 0 : void 0 !== a2 && i2.push(a2);
      let s2 = [];
      s2 = s2.concat(i2);
      for (let e3 = 0; e3 < i2.length; e3++) {
        const t3 = i2[e3], n3 = ot[t3];
        void 0 !== n3 && s2.push(n3);
      }
      let c2 = Ho(e2, t2, s2, a2);
      if (void 0 === c2 && r2 === qt) throw new RangeError(`${t2} is required`);
      return c2 && c2 in rt ? rt[c2] : c2;
    }
    function _t(e2) {
      const t2 = e2.relativeTo;
      if (void 0 === t2) return {};
      let n2, r2, o2, i2, a2, s2 = "option", c2 = false;
      if (Ae(t2)) {
        if (wt(t2)) return { zonedRelativeTo: t2 };
        if (mt(t2)) return { plainRelativeTo: t2 };
        if (yt(t2)) return { plainRelativeTo: pn(re(t2, T).isoDate, re(t2, E)) };
        o2 = Nn(t2);
        const e3 = tn(o2, t2, ["year", "month", "monthCode", "day"], ["hour", "minute", "second", "millisecond", "microsecond", "nanosecond", "offset", "timeZone"], []);
        ({ isoDate: n2, time: r2 } = on(o2, e3, "constrain")), { offset: a2, timeZone: i2 } = e3, void 0 === a2 && (s2 = "wall");
      } else {
        let e3, d2, h2, u2, l2;
        if ({ year: h2, month: u2, day: l2, time: r2, calendar: o2, tzAnnotation: e3, offset: a2, z: d2 } = Mt(Ve(t2)), e3) i2 = Bn(e3), d2 ? s2 = "exact" : a2 || (s2 = "wall"), c2 = true;
        else if (d2) throw new RangeError("Z designator not supported for PlainDate relativeTo; either remove the Z or add a bracketed time zone");
        o2 || (o2 = "iso8601"), o2 = zo(o2), n2 = { year: h2, month: u2, day: l2 };
      }
      return void 0 === i2 ? { plainRelativeTo: pn(n2, o2) } : { zonedRelativeTo: $n(mn(n2, r2, s2, "option" === s2 ? sr(a2) : 0, i2, "compatible", "reject", c2), i2, o2) };
    }
    function Jt(e2) {
      return 0 !== re(e2, Y) ? "year" : 0 !== re(e2, R) ? "month" : 0 !== re(e2, S) ? "week" : 0 !== re(e2, j) ? "day" : 0 !== re(e2, k) ? "hour" : 0 !== re(e2, N) ? "minute" : 0 !== re(e2, x) ? "second" : 0 !== re(e2, L) ? "millisecond" : 0 !== re(e2, P) ? "microsecond" : "nanosecond";
    }
    function Gt(e2, t2) {
      return it.indexOf(e2) > it.indexOf(t2) ? t2 : e2;
    }
    function Kt(e2) {
      return "year" === e2 || "month" === e2 || "week" === e2;
    }
    function Vt(e2) {
      return Kt(e2) || "day" === e2 ? "date" : "time";
    }
    function Xt(e2) {
      return ce("%calendarImpl%")(e2);
    }
    function Qt(e2) {
      return ce("%calendarImpl%")(re(e2, E));
    }
    function en(e2, t2, n2 = "date") {
      const r2 = /* @__PURE__ */ Object.create(null), o2 = Xt(e2).isoToDate(t2, { year: true, monthCode: true, day: true });
      return r2.monthCode = o2.monthCode, "month-day" !== n2 && "date" !== n2 || (r2.day = o2.day), "year-month" !== n2 && "date" !== n2 || (r2.year = o2.year), r2;
    }
    function tn(e2, t2, n2, r2, o2) {
      const i2 = Xt(e2).extraFields(n2), a2 = n2.concat(r2, i2), s2 = /* @__PURE__ */ Object.create(null);
      let c2 = false;
      a2.sort();
      for (let e3 = 0; e3 < a2.length; e3++) {
        const n3 = a2[e3], r3 = t2[n3];
        if (void 0 !== r3) c2 = true, s2[n3] = (0, et[n3])(r3);
        else if ("partial" !== o2) {
          if (o2.includes(n3)) throw new TypeError(`required property '${n3}' missing or undefined`);
          s2[n3] = tt[n3];
        }
      }
      if ("partial" === o2 && !c2) throw new TypeError("no supported properties found");
      return s2;
    }
    function nn(e2, t2 = "complete") {
      const n2 = ["hour", "microsecond", "millisecond", "minute", "nanosecond", "second"];
      let r2 = false;
      const o2 = /* @__PURE__ */ Object.create(null);
      for (let i2 = 0; i2 < n2.length; i2++) {
        const a2 = n2[i2], s2 = e2[a2];
        void 0 !== s2 ? (o2[a2] = _e(s2), r2 = true) : "complete" === t2 && (o2[a2] = 0);
      }
      if (!r2) throw new TypeError("invalid time-like");
      return o2;
    }
    function rn(e2, t2) {
      if (Ae(e2)) {
        if (mt(e2)) return Lt(Zo(t2)), pn(re(e2, D), re(e2, E));
        if (wt(e2)) {
          const n4 = zn(re(e2, $), re(e2, b));
          return Lt(Zo(t2)), pn(n4.isoDate, re(e2, E));
        }
        if (yt(e2)) return Lt(Zo(t2)), pn(re(e2, T).isoDate, re(e2, E));
        const n3 = Nn(e2);
        return pn(Ln(n3, tn(n3, e2, ["year", "month", "monthCode", "day"], [], []), Lt(Zo(t2))), n3);
      }
      let { year: n2, month: r2, day: o2, calendar: i2, z: a2 } = Mt(Ve(e2));
      if (a2) throw new RangeError("Z designator not supported for PlainDate");
      return i2 || (i2 = "iso8601"), i2 = zo(i2), Lt(Zo(t2)), pn({ year: n2, month: r2, day: o2 }, i2);
    }
    function on(e2, t2, n2) {
      return xt(Ln(e2, t2, n2), jt(t2.hour, t2.minute, t2.second, t2.millisecond, t2.microsecond, t2.nanosecond, n2));
    }
    function an(e2, t2) {
      let n2, r2, o2;
      if (Ae(e2)) {
        if (yt(e2)) return Lt(Zo(t2)), wn(re(e2, T), re(e2, E));
        if (wt(e2)) {
          const n3 = zn(re(e2, $), re(e2, b));
          return Lt(Zo(t2)), wn(n3, re(e2, E));
        }
        if (mt(e2)) return Lt(Zo(t2)), wn(xt(re(e2, D), { deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }), re(e2, E));
        o2 = Nn(e2);
        const i2 = tn(o2, e2, ["year", "month", "monthCode", "day"], ["hour", "minute", "second", "millisecond", "microsecond", "nanosecond"], []), a2 = Lt(Zo(t2));
        ({ isoDate: n2, time: r2 } = on(o2, i2, a2));
      } else {
        let i2, a2, s2, c2;
        if ({ year: a2, month: s2, day: c2, time: r2, calendar: o2, z: i2 } = Mt(Ve(e2)), i2) throw new RangeError("Z designator not supported for PlainDateTime");
        "start-of-day" === r2 && (r2 = { deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }), Ur(a2, s2, c2, r2.hour, r2.minute, r2.second, r2.millisecond, r2.microsecond, r2.nanosecond), o2 || (o2 = "iso8601"), o2 = zo(o2), Lt(Zo(t2)), n2 = { year: a2, month: s2, day: c2 };
      }
      return wn(xt(n2, r2), o2);
    }
    function sn(e2) {
      const t2 = ce("%Temporal.Duration%");
      if (lt(e2)) return new t2(re(e2, Y), re(e2, R), re(e2, S), re(e2, j), re(e2, k), re(e2, N), re(e2, x), re(e2, L), re(e2, P), re(e2, U));
      if (!Ae(e2)) return (function(e3) {
        const { years: t3, months: n3, weeks: r3, days: o2, hours: i2, minutes: a2, seconds: s2, milliseconds: c2, microseconds: d2, nanoseconds: h2 } = (function(e4) {
          const t4 = Ye.exec(e4);
          if (!t4) throw new RangeError(`invalid duration: ${e4}`);
          if (t4.every(((e5, t5) => t5 < 2 || void 0 === e5))) throw new RangeError(`invalid duration: ${e4}`);
          const n4 = "-" === t4[1] ? -1 : 1, r4 = void 0 === t4[2] ? 0 : _e(t4[2]) * n4, o3 = void 0 === t4[3] ? 0 : _e(t4[3]) * n4, i3 = void 0 === t4[4] ? 0 : _e(t4[4]) * n4, a3 = void 0 === t4[5] ? 0 : _e(t4[5]) * n4, s3 = void 0 === t4[6] ? 0 : _e(t4[6]) * n4, c3 = t4[7], d3 = t4[8], h3 = t4[9], u2 = t4[10], l2 = t4[11];
          let m2 = 0, f2 = 0, y2 = 0;
          if (void 0 !== c3) {
            if (d3 ?? h3 ?? u2 ?? l2) throw new RangeError("only the smallest unit can be fractional");
            y2 = 3600 * _e((c3 + "000000000").slice(0, 9)) * n4;
          } else if (m2 = void 0 === d3 ? 0 : _e(d3) * n4, void 0 !== h3) {
            if (u2 ?? l2) throw new RangeError("only the smallest unit can be fractional");
            y2 = 60 * _e((h3 + "000000000").slice(0, 9)) * n4;
          } else f2 = void 0 === u2 ? 0 : _e(u2) * n4, void 0 !== l2 && (y2 = _e((l2 + "000000000").slice(0, 9)) * n4);
          const p2 = y2 % 1e3, g2 = Math.trunc(y2 / 1e3) % 1e3, w2 = Math.trunc(y2 / 1e6) % 1e3;
          return f2 += Math.trunc(y2 / 1e9) % 60, m2 += Math.trunc(y2 / 6e10), zr(r4, o3, i3, a3, s3, m2, f2, w2, g2, p2), { years: r4, months: o3, weeks: i3, days: a3, hours: s3, minutes: m2, seconds: f2, milliseconds: w2, microseconds: g2, nanoseconds: p2 };
        })(e3);
        return new (ce("%Temporal.Duration%"))(t3, n3, r3, o2, i2, a2, s2, c2, d2, h2);
      })(Ve(e2));
      const n2 = { years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0, microseconds: 0, nanoseconds: 0 };
      let r2 = kt(e2);
      for (let e3 = 0; e3 < st.length; e3++) {
        const t3 = st[e3], o2 = r2[t3];
        void 0 !== o2 && (n2[t3] = o2);
      }
      return new t2(n2.years, n2.months, n2.weeks, n2.days, n2.hours, n2.minutes, n2.seconds, n2.milliseconds, n2.microseconds, n2.nanoseconds);
    }
    function cn(e2) {
      let t2;
      if (Ae(e2)) {
        if (ut(e2) || wt(e2)) return Cn(re(e2, b));
        t2 = Xe(e2);
      } else t2 = e2;
      const { year: n2, month: r2, day: o2, time: i2, offset: a2, z: s2 } = (function(e3) {
        const t3 = Mt(e3);
        if (!t3.z && !t3.offset) throw new RangeError("Temporal.Instant requires a time zone offset");
        return t3;
      })(Ve(t2)), { hour: c2 = 0, minute: d2 = 0, second: h2 = 0, millisecond: u2 = 0, microsecond: l2 = 0, nanosecond: m2 = 0 } = "start-of-day" === i2 ? {} : i2, f2 = $r(n2, r2, o2, c2, d2, h2, u2, l2, m2 - (s2 ? 0 : sr(a2)));
      return Kr(f2.isoDate), Cn(pr(f2));
    }
    function dn(e2, t2) {
      if (Ae(e2)) {
        if (gt(e2)) return Lt(Zo(t2)), bn(re(e2, D), re(e2, E));
        let n3;
        return ne(e2, E) ? n3 = re(e2, E) : (n3 = e2.calendar, void 0 === n3 && (n3 = "iso8601"), n3 = kn(n3)), bn(Un(n3, tn(n3, e2, ["year", "month", "monthCode", "day"], [], []), Lt(Zo(t2))), n3);
      }
      let { month: n2, day: r2, referenceISOYear: o2, calendar: i2 } = Ct(Ve(e2));
      if (void 0 === i2 && (i2 = "iso8601"), i2 = zo(i2), Lt(Zo(t2)), "iso8601" === i2) return bn({ year: 1972, month: n2, day: r2 }, i2);
      let a2 = { year: o2, month: n2, day: r2 };
      return Lr(a2), a2 = Un(i2, en(i2, a2, "month-day"), "constrain"), bn(a2, i2);
    }
    function hn(e2, t2) {
      let n2;
      if (Ae(e2)) {
        if (ft(e2)) return Lt(Zo(t2)), Tn(re(e2, M));
        if (yt(e2)) return Lt(Zo(t2)), Tn(re(e2, T).time);
        if (wt(e2)) {
          const n3 = zn(re(e2, $), re(e2, b));
          return Lt(Zo(t2)), Tn(n3.time);
        }
        const { hour: r2, minute: o2, second: i2, millisecond: a2, microsecond: s2, nanosecond: c2 } = nn(e2);
        n2 = jt(r2, o2, i2, a2, s2, c2, Lt(Zo(t2)));
      } else n2 = Et(Ve(e2)), Lt(Zo(t2));
      return Tn(n2);
    }
    function un(e2) {
      return void 0 === e2 ? { deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 } : re(hn(e2), M);
    }
    function ln(e2, t2) {
      if (Ae(e2)) {
        if (pt(e2)) return Lt(Zo(t2)), En(re(e2, D), re(e2, E));
        const n3 = Nn(e2);
        return En(Pn(n3, tn(n3, e2, ["year", "month", "monthCode"], [], []), Lt(Zo(t2))), n3);
      }
      let { year: n2, month: r2, referenceISODay: o2, calendar: i2 } = It(Ve(e2));
      void 0 === i2 && (i2 = "iso8601"), i2 = zo(i2), Lt(Zo(t2));
      let a2 = { year: n2, month: r2, day: o2 };
      return Hr(a2), a2 = Pn(i2, en(i2, a2, "year-month"), "constrain"), En(a2, i2);
    }
    function mn(t2, n2, r2, o2, i2, a2, s2, c2) {
      if ("start-of-day" === n2) return _n(i2, t2);
      const d2 = xt(t2, n2);
      if ("wall" === r2 || "ignore" === s2) return An(i2, d2, a2);
      if ("exact" === r2 || "use" === s2) {
        const e2 = $r(t2.year, t2.month, t2.day, n2.hour, n2.minute, n2.second, n2.millisecond, n2.microsecond, n2.nanosecond - o2);
        Kr(e2.isoDate);
        const r3 = pr(e2);
        return Fr(r3), r3;
      }
      Kr(t2);
      const h2 = pr(d2), u2 = Wn(i2, d2);
      for (let t3 = 0; t3 < u2.length; t3++) {
        const n3 = u2[t3], r3 = e.toNumber(e.subtract(h2, n3)), i3 = Eo(r3, 6e10, "halfExpand");
        if (r3 === o2 || c2 && i3 === o2) return n3;
      }
      if ("reject" === s2) {
        const e2 = Hn(o2), t3 = nr(d2, "iso8601", "auto");
        throw new RangeError(`Offset ${e2} is invalid for ${t3} in ${i2}`);
      }
      return qn(u2, i2, d2, a2);
    }
    function fn(e2, t2) {
      let n2, r2, o2, i2, a2, s2, c2, d2 = false, h2 = "option";
      if (Ae(e2)) {
        if (wt(e2)) {
          const n3 = Zo(t2);
          return Pt(n3), Bt(n3, "reject"), Lt(n3), $n(re(e2, b), re(e2, $), re(e2, E));
        }
        a2 = Nn(e2);
        const d3 = tn(a2, e2, ["year", "month", "monthCode", "day"], ["hour", "minute", "second", "millisecond", "microsecond", "nanosecond", "offset", "timeZone"], ["timeZone"]);
        ({ offset: i2, timeZone: o2 } = d3), void 0 === i2 && (h2 = "wall");
        const u3 = Zo(t2);
        s2 = Pt(u3), c2 = Bt(u3, "reject");
        const l2 = Lt(u3);
        ({ isoDate: n2, time: r2 } = on(a2, d3, l2));
      } else {
        let u3, l2, m2, f2, y2;
        ({ year: m2, month: f2, day: y2, time: r2, tzAnnotation: u3, offset: i2, z: l2, calendar: a2 } = (function(e3) {
          const t3 = Mt(e3);
          if (!t3.tzAnnotation) throw new RangeError("Temporal.ZonedDateTime requires a time zone ID in brackets");
          return t3;
        })(Ve(e2))), o2 = Bn(u3), l2 ? h2 = "exact" : i2 || (h2 = "wall"), a2 || (a2 = "iso8601"), a2 = zo(a2), d2 = true;
        const p2 = Zo(t2);
        s2 = Pt(p2), c2 = Bt(p2, "reject"), Lt(p2), n2 = { year: m2, month: f2, day: y2 };
      }
      let u2 = 0;
      return "option" === h2 && (u2 = sr(i2)), $n(mn(n2, r2, h2, u2, o2, s2, c2, d2), o2, a2);
    }
    function yn(e2, t2, n2) {
      Lr(t2), te(e2), oe(e2, D, t2), oe(e2, E, n2), oe(e2, I, true);
    }
    function pn(e2, t2) {
      const n2 = ce("%Temporal.PlainDate%"), r2 = Object.create(n2.prototype);
      return yn(r2, e2, t2), r2;
    }
    function gn(e2, t2, n2) {
      Br(t2), te(e2), oe(e2, T, t2), oe(e2, E, n2);
    }
    function wn(e2, t2) {
      const n2 = ce("%Temporal.PlainDateTime%"), r2 = Object.create(n2.prototype);
      return gn(r2, e2, t2), r2;
    }
    function vn(e2, t2, n2) {
      Lr(t2), te(e2), oe(e2, D, t2), oe(e2, E, n2), oe(e2, O, true);
    }
    function bn(e2, t2) {
      const n2 = ce("%Temporal.PlainMonthDay%"), r2 = Object.create(n2.prototype);
      return vn(r2, e2, t2), r2;
    }
    function Dn(e2, t2) {
      te(e2), oe(e2, M, t2);
    }
    function Tn(e2) {
      const t2 = ce("%Temporal.PlainTime%"), n2 = Object.create(t2.prototype);
      return Dn(n2, e2), n2;
    }
    function Mn(e2, t2, n2) {
      Hr(t2), te(e2), oe(e2, D, t2), oe(e2, E, n2), oe(e2, C, true);
    }
    function En(e2, t2) {
      const n2 = ce("%Temporal.PlainYearMonth%"), r2 = Object.create(n2.prototype);
      return Mn(r2, e2, t2), r2;
    }
    function In(e2, t2) {
      Fr(t2), te(e2), oe(e2, b, t2);
    }
    function Cn(e2) {
      const t2 = ce("%Temporal.Instant%"), n2 = Object.create(t2.prototype);
      return In(n2, e2), n2;
    }
    function On(e2, t2, n2, r2) {
      Fr(t2), te(e2), oe(e2, b, t2), oe(e2, $, n2), oe(e2, E, r2);
    }
    function $n(e2, t2, n2 = "iso8601") {
      const r2 = ce("%Temporal.ZonedDateTime%"), o2 = Object.create(r2.prototype);
      return On(o2, e2, t2, n2), o2;
    }
    function Yn(e2) {
      return Qe.filter(((t2) => void 0 !== e2[t2]));
    }
    function Rn(e2, t2, n2) {
      const r2 = Yn(n2), o2 = Xt(e2).fieldKeysToIgnore(r2), i2 = /* @__PURE__ */ Object.create(null), a2 = Yn(t2);
      for (let e3 = 0; e3 < Qe.length; e3++) {
        let s2;
        const c2 = Qe[e3];
        a2.includes(c2) && !o2.includes(c2) && (s2 = t2[c2]), r2.includes(c2) && (s2 = n2[c2]), void 0 !== s2 && (i2[c2] = s2);
      }
      return i2;
    }
    function Sn(e2, t2, n2, r2) {
      const o2 = Xt(e2).dateAdd(t2, n2, r2);
      return Lr(o2), o2;
    }
    function jn(e2, t2, n2, r2) {
      return Xt(e2).dateUntil(t2, n2, r2);
    }
    function kn(e2) {
      if (Ae(e2) && ne(e2, E)) return re(e2, E);
      const t2 = Ve(e2);
      try {
        return zo(t2);
      } catch {
      }
      let n2;
      try {
        ({ calendar: n2 } = Mt(t2));
      } catch {
        try {
          ({ calendar: n2 } = Et(t2));
        } catch {
          try {
            ({ calendar: n2 } = It(t2));
          } catch {
            ({ calendar: n2 } = Ct(t2));
          }
        }
      }
      return n2 || (n2 = "iso8601"), zo(n2);
    }
    function Nn(e2) {
      if (ne(e2, E)) return re(e2, E);
      const { calendar: t2 } = e2;
      return void 0 === t2 ? "iso8601" : kn(t2);
    }
    function xn(e2, t2) {
      return zo(e2) === zo(t2);
    }
    function Ln(e2, t2, n2) {
      const r2 = Xt(e2);
      r2.resolveFields(t2, "date");
      const o2 = r2.dateToISO(t2, n2);
      return Lr(o2), o2;
    }
    function Pn(e2, t2, n2) {
      const r2 = Xt(e2);
      r2.resolveFields(t2, "year-month"), t2.day = 1;
      const o2 = r2.dateToISO(t2, n2);
      return Hr(o2), o2;
    }
    function Un(e2, t2, n2) {
      const r2 = Xt(e2);
      r2.resolveFields(t2, "month-day");
      const o2 = r2.monthDayToISOReferenceDate(t2, n2);
      return Lr(o2), o2;
    }
    function Bn(e2) {
      if (Ae(e2) && wt(e2)) return re(e2, $);
      const t2 = Ve(e2);
      if ("UTC" === t2) return "UTC";
      const { tzName: n2, offsetMinutes: r2 } = (function(e3) {
        const { tzAnnotation: t3, offset: n3, z: r3 } = (function(e4) {
          if (Ot.test(e4)) return { tzAnnotation: e4, offset: void 0, z: false };
          try {
            const { tzAnnotation: t4, offset: n4, z: r4 } = Mt(e4);
            if (r4 || t4 || n4) return { tzAnnotation: t4, offset: n4, z: r4 };
          } catch {
          }
          Yt(e4);
        })(e3);
        return t3 ? Rt(t3) : r3 ? Rt("UTC") : n3 ? Rt(n3) : void 0;
      })(t2);
      if (void 0 !== r2) return mr(r2);
      const o2 = hr(n2);
      if (!o2) throw new RangeError(`Unrecognized time zone ${n2}`);
      return o2.identifier;
    }
    function Zn(e2, t2) {
      if (e2 === t2) return true;
      const n2 = Rt(e2).offsetMinutes, r2 = Rt(t2).offsetMinutes;
      if (void 0 === n2 && void 0 === r2) {
        const n3 = hr(t2);
        if (!n3) return false;
        const r3 = hr(e2);
        return !!r3 && r3.primaryIdentifier === n3.primaryIdentifier;
      }
      return n2 === r2;
    }
    function Fn(e2, t2) {
      const n2 = Rt(e2).offsetMinutes;
      return void 0 !== n2 ? 6e10 * n2 : lr(e2, t2);
    }
    function Hn(e2) {
      const t2 = e2 < 0 ? "-" : "+", n2 = Math.abs(e2), r2 = Math.floor(n2 / 36e11), o2 = Math.floor(n2 / 6e10) % 60, i2 = Math.floor(n2 / 1e9) % 60, a2 = n2 % 1e9;
      return `${t2}${Vn(r2, o2, i2, a2, 0 === i2 && 0 === a2 ? "minute" : "auto")}`;
    }
    function zn(e2, t2) {
      const n2 = Fn(e2, t2);
      let { isoDate: { year: r2, month: o2, day: i2 }, time: { hour: a2, minute: s2, second: c2, millisecond: d2, microsecond: h2, nanosecond: u2 } } = gr(t2);
      return $r(r2, o2, i2, a2, s2, c2, d2, h2, u2 + n2);
    }
    function An(e2, t2, n2) {
      return qn(Wn(e2, t2), e2, t2, n2);
    }
    function qn(t2, n2, r2, o2) {
      const i2 = t2.length;
      if (1 === i2) return t2[0];
      if (i2) switch (o2) {
        case "compatible":
        case "earlier":
          return t2[0];
        case "later":
          return t2[i2 - 1];
        case "reject":
          throw new RangeError("multiple instants found");
      }
      if ("reject" === o2) throw new RangeError("multiple instants found");
      const a2 = pr(r2), s2 = e.subtract(a2, l);
      Fr(s2);
      const c2 = Fn(n2, s2), d2 = e.add(a2, l);
      Fr(d2);
      const h2 = Fn(n2, d2) - c2;
      switch (o2) {
        case "earlier": {
          const e2 = TimeDuration.fromComponents(0, 0, 0, 0, 0, -h2), t3 = fo(r2.time, e2);
          return Wn(n2, xt(Or(r2.isoDate.year, r2.isoDate.month, r2.isoDate.day + t3.deltaDays), t3))[0];
        }
        case "compatible":
        case "later": {
          const e2 = TimeDuration.fromComponents(0, 0, 0, 0, 0, h2), t3 = fo(r2.time, e2), o3 = Wn(n2, xt(Or(r2.isoDate.year, r2.isoDate.month, r2.isoDate.day + t3.deltaDays), t3));
          return o3[o3.length - 1];
        }
      }
    }
    function Wn(t2, n2) {
      if ("UTC" === t2) return Kr(n2.isoDate), [pr(n2)];
      const r2 = Rt(t2).offsetMinutes;
      if (void 0 !== r2) {
        const e2 = $r(n2.isoDate.year, n2.isoDate.month, n2.isoDate.day, n2.time.hour, n2.time.minute - r2, n2.time.second, n2.time.millisecond, n2.time.microsecond, n2.time.nanosecond);
        Kr(e2.isoDate);
        const t3 = pr(e2);
        return Fr(t3), [t3];
      }
      return Kr(n2.isoDate), (function(t3, n3) {
        let r3 = pr(n3), o2 = e.subtract(r3, l);
        e.lessThan(o2, xe) && (o2 = r3);
        let i2 = e.add(r3, l);
        e.greaterThan(i2, Ne) && (i2 = r3);
        const a2 = lr(t3, o2), s2 = lr(t3, i2), c2 = (a2 === s2 ? [a2] : [a2, s2]).map(((o3) => {
          const i3 = e.subtract(r3, e.BigInt(o3)), a3 = (function(e2, t4) {
            const { epochMilliseconds: n4, time: { millisecond: r4, microsecond: o4, nanosecond: i4 } } = gr(t4), { year: a4, month: s3, day: c3, hour: d2, minute: h2, second: u2 } = br(e2, n4);
            return $r(a4, s3, c3, d2, h2, u2, r4, o4, i4);
          })(t3, i3);
          if (0 === jo(n3, a3)) return Fr(i3), i3;
        }));
        return c2.filter(((e2) => void 0 !== e2));
      })(t2, n2);
    }
    function _n(t2, n2) {
      const r2 = xt(n2, { deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }), o2 = Wn(t2, r2);
      if (o2.length) return o2[0];
      const i2 = pr(r2), a2 = e.subtract(i2, l);
      return Fr(a2), wr(t2, a2);
    }
    function Jn(e2) {
      let t2;
      return t2 = e2 < 0 || e2 > 9999 ? (e2 < 0 ? "-" : "+") + Ke(Math.abs(e2), 6) : Ke(e2, 4), t2;
    }
    function Gn(e2) {
      return Ke(e2, 2);
    }
    function Kn(e2, t2) {
      let n2;
      if ("auto" === t2) {
        if (0 === e2) return "";
        n2 = Ke(e2, 9).replace(/0+$/, "");
      } else {
        if (0 === t2) return "";
        n2 = Ke(e2, 9).slice(0, t2);
      }
      return `.${n2}`;
    }
    function Vn(e2, t2, n2, r2, o2) {
      let i2 = `${Gn(e2)}:${Gn(t2)}`;
      return "minute" === o2 || (i2 += `:${Gn(n2)}`, i2 += Kn(r2, o2)), i2;
    }
    function Xn(e2, t2, n2) {
      let r2 = t2;
      void 0 === r2 && (r2 = "UTC");
      const o2 = re(e2, b), i2 = nr(zn(r2, o2), "iso8601", n2, "never");
      let a2 = "Z";
      return void 0 !== t2 && (a2 = fr(Fn(r2, o2))), `${i2}${a2}`;
    }
    function Qn(e2, t2) {
      const n2 = re(e2, Y), r2 = re(e2, R), o2 = re(e2, S), i2 = re(e2, j), a2 = re(e2, k), s2 = re(e2, N), c2 = Mr(e2);
      let d2 = "";
      0 !== n2 && (d2 += `${Math.abs(n2)}Y`), 0 !== r2 && (d2 += `${Math.abs(r2)}M`), 0 !== o2 && (d2 += `${Math.abs(o2)}W`), 0 !== i2 && (d2 += `${Math.abs(i2)}D`);
      let h2 = "";
      0 !== a2 && (h2 += `${Math.abs(a2)}H`), 0 !== s2 && (h2 += `${Math.abs(s2)}M`);
      const u2 = TimeDuration.fromComponents(0, 0, re(e2, x), re(e2, L), re(e2, P), re(e2, U));
      u2.isZero() && !["second", "millisecond", "microsecond", "nanosecond"].includes(Jt(e2)) && "auto" === t2 || (h2 += `${Math.abs(u2.sec)}${Kn(Math.abs(u2.subsec), t2)}S`);
      let l2 = `${c2 < 0 ? "-" : ""}P${d2}`;
      return h2 && (l2 = `${l2}T${h2}`), l2;
    }
    function er(e2, t2 = "auto") {
      const { year: n2, month: r2, day: o2 } = re(e2, D);
      return `${Jn(n2)}-${Gn(r2)}-${Gn(o2)}${Dt(re(e2, E), t2)}`;
    }
    function tr({ hour: e2, minute: t2, second: n2, millisecond: r2, microsecond: o2, nanosecond: i2 }, a2) {
      return Vn(e2, t2, n2, 1e6 * r2 + 1e3 * o2 + i2, a2);
    }
    function nr(e2, t2, n2, r2 = "auto") {
      const { isoDate: { year: o2, month: i2, day: a2 }, time: { hour: s2, minute: c2, second: d2, millisecond: h2, microsecond: u2, nanosecond: l2 } } = e2;
      return `${Jn(o2)}-${Gn(i2)}-${Gn(a2)}T${Vn(s2, c2, d2, 1e6 * h2 + 1e3 * u2 + l2, n2)}${Dt(t2, r2)}`;
    }
    function rr(e2, t2 = "auto") {
      const { year: n2, month: r2, day: o2 } = re(e2, D);
      let i2 = `${Gn(r2)}-${Gn(o2)}`;
      const a2 = re(e2, E);
      "always" !== t2 && "critical" !== t2 && "iso8601" === a2 || (i2 = `${Jn(n2)}-${i2}`);
      const s2 = Dt(a2, t2);
      return s2 && (i2 += s2), i2;
    }
    function or(e2, t2 = "auto") {
      const { year: n2, month: r2, day: o2 } = re(e2, D);
      let i2 = `${Jn(n2)}-${Gn(r2)}`;
      const a2 = re(e2, E);
      "always" !== t2 && "critical" !== t2 && "iso8601" === a2 || (i2 += `-${Gn(o2)}`);
      const s2 = Dt(a2, t2);
      return s2 && (i2 += s2), i2;
    }
    function ir(e2, t2, n2 = "auto", r2 = "auto", o2 = "auto", i2 = void 0) {
      let a2 = re(e2, b);
      if (i2) {
        const { unit: e3, increment: t3, roundingMode: n3 } = i2;
        a2 = Io(a2, t3, e3, n3);
      }
      const s2 = re(e2, $), c2 = Fn(s2, a2);
      let d2 = nr(zn(s2, a2), "iso8601", t2, "never");
      return "never" !== o2 && (d2 += fr(c2)), "never" !== r2 && (d2 += `[${"critical" === r2 ? "!" : ""}${s2}]`), d2 += Dt(re(e2, E), n2), d2;
    }
    function ar(e2) {
      return $t.test(e2);
    }
    function sr(e2) {
      const t2 = _o.exec(e2);
      if (!t2) throw new RangeError(`invalid time zone offset: ${e2}; must match \xB1HH:MM[:SS.SSSSSSSSS]`);
      return ("-" === t2[1] ? -1 : 1) * (1e9 * (60 * (60 * +t2[2] + +(t2[3] || 0)) + +(t2[4] || 0)) + +((t2[5] || 0) + "000000000").slice(0, 9));
    }
    var cr;
    var dr = Object.assign(/* @__PURE__ */ Object.create(null), { "/": true, "-": true, _: true });
    function hr(e2) {
      if (void 0 === cr) {
        const e3 = Intl.supportedValuesOf?.("timeZone");
        if (e3) {
          cr = /* @__PURE__ */ new Map();
          for (let t3 = 0; t3 < e3.length; t3++) {
            const n3 = e3[t3];
            cr.set(Ao(n3), n3);
          }
        } else cr = null;
      }
      const t2 = Ao(e2);
      let n2 = cr?.get(t2);
      if (n2) return { identifier: n2, primaryIdentifier: n2 };
      try {
        n2 = ht(e2).resolvedOptions().timeZone;
      } catch {
        return;
      }
      if ("antarctica/south_pole" === t2 && (n2 = "Antarctica/McMurdo"), ze.has(e2)) throw new RangeError(`${e2} is a legacy time zone identifier from ICU. Use ${n2} instead`);
      const r2 = [...t2].map(((e3, n3) => 0 === n3 || dr[t2[n3 - 1]] ? e3.toUpperCase() : e3)).join("").split("/");
      if (1 === r2.length) return "gb-eire" === t2 ? { identifier: "GB-Eire", primaryIdentifier: n2 } : { identifier: t2.length <= 3 || /[-0-9]/.test(t2) ? t2.toUpperCase() : r2[0], primaryIdentifier: n2 };
      if ("Etc" === r2[0]) return { identifier: `Etc/${["Zulu", "Greenwich", "Universal"].includes(r2[1]) ? r2[1] : r2[1].toUpperCase()}`, primaryIdentifier: n2 };
      if ("Us" === r2[0]) return { identifier: `US/${r2[1]}`, primaryIdentifier: n2 };
      const o2 = /* @__PURE__ */ new Map([["Act", "ACT"], ["Lhi", "LHI"], ["Nsw", "NSW"], ["Dar_Es_Salaam", "Dar_es_Salaam"], ["Port_Of_Spain", "Port_of_Spain"], ["Port-Au-Prince", "Port-au-Prince"], ["Isle_Of_Man", "Isle_of_Man"], ["Comodrivadavia", "ComodRivadavia"], ["Knox_In", "Knox_IN"], ["Dumontdurville", "DumontDUrville"], ["Mcmurdo", "McMurdo"], ["Denoronha", "DeNoronha"], ["Easterisland", "EasterIsland"], ["Bajanorte", "BajaNorte"], ["Bajasur", "BajaSur"]]);
      return r2[1] = o2.get(r2[1]) ?? r2[1], r2.length > 2 && (r2[2] = o2.get(r2[2]) ?? r2[2]), { identifier: r2.join("/"), primaryIdentifier: n2 };
    }
    function ur(e2, t2) {
      const { year: n2, month: r2, day: o2, hour: i2, minute: a2, second: s2 } = br(e2, t2);
      let c2 = t2 % 1e3;
      return c2 < 0 && (c2 += 1e3), 1e6 * (yr({ isoDate: { year: n2, month: r2, day: o2 }, time: { hour: i2, minute: a2, second: s2, millisecond: c2 } }) - t2);
    }
    function lr(e2, t2) {
      return ur(e2, No(t2, "floor"));
    }
    function mr(e2) {
      const t2 = e2 < 0 ? "-" : "+", n2 = Math.abs(e2);
      return `${t2}${Vn(Math.floor(n2 / 60), n2 % 60, 0, 0, "minute")}`;
    }
    function fr(e2) {
      return mr(Eo(e2, je, "halfExpand") / 6e10);
    }
    function yr({ isoDate: { year: e2, month: t2, day: n2 }, time: { hour: r2, minute: o2, second: i2, millisecond: a2 } }) {
      const s2 = e2 % 400, c2 = (e2 - s2) / 400, d2 = /* @__PURE__ */ new Date();
      return d2.setUTCHours(r2, o2, i2, a2), d2.setUTCFullYear(s2, t2 - 1, n2), d2.getTime() + Ue * c2;
    }
    function pr(t2) {
      const n2 = yr(t2), r2 = 1e3 * t2.time.microsecond + t2.time.nanosecond;
      return e.add(xo(n2), e.BigInt(r2));
    }
    function gr(t2) {
      let n2 = No(t2, "trunc"), r2 = e.toNumber(e.remainder(t2, c));
      r2 < 0 && (r2 += 1e6, n2 -= 1);
      const o2 = Math.floor(r2 / 1e3) % 1e3, i2 = r2 % 1e3, a2 = new Date(n2);
      return { epochMilliseconds: n2, isoDate: { year: a2.getUTCFullYear(), month: a2.getUTCMonth() + 1, day: a2.getUTCDate() }, time: { hour: a2.getUTCHours(), minute: a2.getUTCMinutes(), second: a2.getUTCSeconds(), millisecond: a2.getUTCMilliseconds(), microsecond: o2, nanosecond: i2 } };
    }
    function wr(e2, t2) {
      if ("UTC" === e2) return null;
      const n2 = No(t2, "floor");
      if (n2 < Fe) return wr(e2, xo(Fe));
      const r2 = Date.now(), o2 = Math.max(n2, r2) + 366 * Re * 3;
      let i2 = n2, a2 = ur(e2, i2), s2 = i2, c2 = a2;
      for (; a2 === c2 && i2 < o2; ) {
        if (s2 = i2 + 2 * Re * 7, s2 > ke) return null;
        c2 = ur(e2, s2), a2 === c2 && (i2 = s2);
      }
      return a2 === c2 ? null : xo(Jo(((t3) => ur(e2, t3)), i2, s2, a2, c2));
    }
    function vr(t2, n2) {
      if ("UTC" === t2) return null;
      const r2 = No(n2, "ceil"), o2 = Date.now(), i2 = o2 + 366 * Re * 3;
      if (r2 > i2) {
        const n3 = vr(t2, xo(i2));
        if (null === n3 || e.lessThan(n3, xo(o2))) return n3;
      }
      if ("Africa/Casablanca" === t2 || "Africa/El_Aaiun" === t2) {
        const e2 = Date.UTC(2088, 0, 1);
        if (e2 < r2) return vr(t2, xo(e2));
      }
      let a2 = r2 - 1;
      if (a2 < Fe) return null;
      let s2 = ur(t2, a2), c2 = a2, d2 = s2;
      for (; s2 === d2 && a2 > Fe; ) {
        if (c2 = a2 - 2 * Re * 7, c2 < Fe) return null;
        d2 = ur(t2, c2), s2 === d2 && (a2 = c2);
      }
      return s2 === d2 ? null : xo(Jo(((e2) => ur(t2, e2)), c2, a2, d2, s2));
    }
    function br(e2, t2) {
      return (function(e3) {
        const t3 = e3.split(/[^\w]+/);
        if (7 !== t3.length) throw new RangeError(`expected 7 parts in "${e3}`);
        const n2 = +t3[0], r2 = +t3[1];
        let o2 = +t3[2];
        const i2 = t3[3];
        if ("b" === i2[0] || "B" === i2[0]) o2 = 1 - o2;
        else if ("a" !== i2[0] && "A" !== i2[0]) throw new RangeError(`Unknown era ${i2} in "${e3}`);
        const a2 = "24" === t3[4] ? 0 : +t3[4], s2 = +t3[5], c2 = +t3[6];
        if (!(Number.isFinite(o2) && Number.isFinite(n2) && Number.isFinite(r2) && Number.isFinite(a2) && Number.isFinite(s2) && Number.isFinite(c2))) throw new RangeError(`Invalid number in "${e3}`);
        return { year: o2, month: n2, day: r2, hour: a2, minute: s2, second: c2 };
      })(ht(e2).format(t2));
    }
    function Dr(e2) {
      return void 0 !== e2 && !(e2 % 4 != 0 || e2 % 100 == 0 && e2 % 400 != 0);
    }
    function Tr(e2, t2) {
      return { standard: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], leapyear: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] }[Dr(e2) ? "leapyear" : "standard"][t2 - 1];
    }
    function Mr(e2) {
      const t2 = [re(e2, Y), re(e2, R), re(e2, S), re(e2, j), re(e2, k), re(e2, N), re(e2, x), re(e2, L), re(e2, P), re(e2, U)];
      for (let e3 = 0; e3 < t2.length; e3++) {
        const n2 = t2[e3];
        if (0 !== n2) return n2 < 0 ? -1 : 1;
      }
      return 0;
    }
    function Er(e2) {
      const t2 = ["years", "months", "weeks", "days"];
      for (let n2 = 0; n2 < t2.length; n2++) {
        const r2 = e2[t2[n2]];
        if (0 !== r2) return r2 < 0 ? -1 : 1;
      }
      return 0;
    }
    function Ir(e2) {
      const t2 = Er(e2.date);
      return 0 !== t2 ? t2 : e2.time.sign();
    }
    function Cr(e2, t2) {
      let n2 = e2, r2 = t2;
      if (!Number.isFinite(n2) || !Number.isFinite(r2)) throw new RangeError("infinity is out of range");
      return r2 -= 1, n2 += Math.floor(r2 / 12), r2 %= 12, r2 < 0 && (r2 += 12), r2 += 1, { year: n2, month: r2 };
    }
    function Or(e2, t2, n2) {
      let r2 = e2, o2 = t2, i2 = n2;
      if (!Number.isFinite(i2)) throw new RangeError("infinity is out of range");
      ({ year: r2, month: o2 } = Cr(r2, o2));
      const a2 = 146097;
      if (Math.abs(i2) > a2) {
        const e3 = Math.trunc(i2 / a2);
        r2 += 400 * e3, i2 -= e3 * a2;
      }
      let s2 = 0, c2 = o2 > 2 ? r2 : r2 - 1;
      for (; s2 = Dr(c2) ? 366 : 365, i2 < -s2; ) r2 -= 1, c2 -= 1, i2 += s2;
      for (c2 += 1; s2 = Dr(c2) ? 366 : 365, i2 > s2; ) r2 += 1, c2 += 1, i2 -= s2;
      for (; i2 < 1; ) ({ year: r2, month: o2 } = Cr(r2, o2 - 1)), i2 += Tr(r2, o2);
      for (; i2 > Tr(r2, o2); ) i2 -= Tr(r2, o2), { year: r2, month: o2 } = Cr(r2, o2 + 1);
      return { year: r2, month: o2, day: i2 };
    }
    function $r(e2, t2, n2, r2, o2, i2, a2, s2, c2) {
      const d2 = Yr(r2, o2, i2, a2, s2, c2);
      return xt(Or(e2, t2, n2 + d2.deltaDays), d2);
    }
    function Yr(e2, t2, n2, r2, o2, i2) {
      let a2, s2 = e2, c2 = t2, d2 = n2, h2 = r2, u2 = o2, l2 = i2;
      ({ div: a2, mod: l2 } = de(l2, 3)), u2 += a2, l2 < 0 && (u2 -= 1, l2 += 1e3), { div: a2, mod: u2 } = de(u2, 3), h2 += a2, u2 < 0 && (h2 -= 1, u2 += 1e3), d2 += Math.trunc(h2 / 1e3), h2 %= 1e3, h2 < 0 && (d2 -= 1, h2 += 1e3), c2 += Math.trunc(d2 / 60), d2 %= 60, d2 < 0 && (c2 -= 1, d2 += 60), s2 += Math.trunc(c2 / 60), c2 %= 60, c2 < 0 && (s2 -= 1, c2 += 60);
      let m2 = Math.trunc(s2 / 24);
      return s2 %= 24, s2 < 0 && (m2 -= 1, s2 += 24), m2 += 0, s2 += 0, c2 += 0, d2 += 0, h2 += 0, u2 += 0, l2 += 0, { deltaDays: m2, hour: s2, minute: c2, second: d2, millisecond: h2, microsecond: u2, nanosecond: l2 };
    }
    function Rr(e2, t2) {
      const n2 = Nt(e2, 0);
      if (0 === Er(n2)) return e2.days;
      const r2 = re(t2, D), o2 = Sn(re(t2, E), r2, n2, "constrain"), i2 = Gr(r2.year, r2.month - 1, r2.day), a2 = Gr(o2.year, o2.month - 1, o2.day) - i2;
      return e2.days + a2;
    }
    function Sr(e2) {
      return new (ce("%Temporal.Duration%"))(-re(e2, Y), -re(e2, R), -re(e2, S), -re(e2, j), -re(e2, k), -re(e2, N), -re(e2, x), -re(e2, L), -re(e2, P), -re(e2, U));
    }
    function jr(e2, t2, n2) {
      return Math.min(n2, Math.max(t2, e2));
    }
    function kr(e2, t2, n2) {
      const r2 = jr(t2, 1, 12);
      return { year: e2, month: r2, day: jr(n2, 1, Tr(e2, r2)) };
    }
    function Nr(e2, t2, n2) {
      if (e2 < t2 || e2 > n2) throw new RangeError(`value out of range: ${t2} <= ${e2} <= ${n2}`);
    }
    function xr(e2, t2, n2) {
      Nr(t2, 1, 12), Nr(n2, 1, Tr(e2, t2));
    }
    function Lr(e2) {
      Br(xt(e2, { deltaDays: 0, hour: 12, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }));
    }
    function Pr(e2, t2, n2, r2, o2, i2) {
      Nr(e2, 0, 23), Nr(t2, 0, 59), Nr(n2, 0, 59), Nr(r2, 0, 999), Nr(o2, 0, 999), Nr(i2, 0, 999);
    }
    function Ur(e2, t2, n2, r2, o2, i2, a2, s2, c2) {
      xr(e2, t2, n2), Pr(r2, o2, i2, a2, s2, c2);
    }
    function Br(t2) {
      const n2 = pr(t2);
      (e.lessThan(n2, Le) || e.greaterThan(n2, Pe)) && Fr(n2);
    }
    function Zr(e2) {
      pr(e2);
    }
    function Fr(t2) {
      if (e.lessThan(t2, xe) || e.greaterThan(t2, Ne)) throw new RangeError("date/time value is outside of supported range");
    }
    function Hr({ year: e2, month: t2 }) {
      Nr(e2, Be, Ze), e2 === Be ? Nr(t2, 4, 12) : e2 === Ze && Nr(t2, 1, 9);
    }
    function zr(e2, t2, n2, r2, o2, i2, a2, s2, c2, d2) {
      let h2 = 0;
      const u2 = [e2, t2, n2, r2, o2, i2, a2, s2, c2, d2];
      for (let e3 = 0; e3 < u2.length; e3++) {
        const t3 = u2[e3];
        if (t3 === 1 / 0 || t3 === -1 / 0) throw new RangeError("infinite values not allowed as duration fields");
        if (0 !== t3) {
          const e4 = t3 < 0 ? -1 : 1;
          if (0 !== h2 && e4 !== h2) throw new RangeError("mixed-sign values not allowed as duration fields");
          h2 = e4;
        }
      }
      if (Math.abs(e2) >= 2 ** 32 || Math.abs(t2) >= 2 ** 32 || Math.abs(n2) >= 2 ** 32) throw new RangeError("years, months, and weeks must be < 2\xB3\xB2");
      const l2 = de(s2, 3), m2 = de(c2, 6), f2 = de(d2, 9), y2 = de(1e6 * l2.mod + 1e3 * m2.mod + f2.mod, 9).div, p2 = 86400 * r2 + 3600 * o2 + 60 * i2 + a2 + l2.div + m2.div + f2.div + y2;
      if (!Number.isSafeInteger(p2)) throw new RangeError("total of duration time units cannot exceed 9007199254740991.999999999 s");
    }
    function Ar(e2) {
      return { date: { years: re(e2, Y), months: re(e2, R), weeks: re(e2, S), days: re(e2, j) }, time: TimeDuration.fromComponents(re(e2, k), re(e2, N), re(e2, x), re(e2, L), re(e2, P), re(e2, U)) };
    }
    function qr(e2) {
      const t2 = TimeDuration.fromComponents(re(e2, k), re(e2, N), re(e2, x), re(e2, L), re(e2, P), re(e2, U)).add24HourDays(re(e2, j));
      return { date: { years: re(e2, Y), months: re(e2, R), weeks: re(e2, S), days: 0 }, time: t2 };
    }
    function Wr(e2) {
      const t2 = qr(e2), n2 = Math.trunc(t2.time.sec / 86400);
      return zr(t2.date.years, t2.date.months, t2.date.weeks, n2, 0, 0, 0, 0, 0, 0), { ...t2.date, days: n2 };
    }
    function _r(e2, t2) {
      const n2 = e2.time.sign();
      let r2 = e2.time.abs().subsec, o2 = 0, i2 = 0, a2 = e2.time.abs().sec, s2 = 0, c2 = 0, d2 = 0;
      switch (t2) {
        case "year":
        case "month":
        case "week":
        case "day":
          o2 = Math.trunc(r2 / 1e3), r2 %= 1e3, i2 = Math.trunc(o2 / 1e3), o2 %= 1e3, a2 += Math.trunc(i2 / 1e3), i2 %= 1e3, s2 = Math.trunc(a2 / 60), a2 %= 60, c2 = Math.trunc(s2 / 60), s2 %= 60, d2 = Math.trunc(c2 / 24), c2 %= 24;
          break;
        case "hour":
          o2 = Math.trunc(r2 / 1e3), r2 %= 1e3, i2 = Math.trunc(o2 / 1e3), o2 %= 1e3, a2 += Math.trunc(i2 / 1e3), i2 %= 1e3, s2 = Math.trunc(a2 / 60), a2 %= 60, c2 = Math.trunc(s2 / 60), s2 %= 60;
          break;
        case "minute":
          o2 = Math.trunc(r2 / 1e3), r2 %= 1e3, i2 = Math.trunc(o2 / 1e3), o2 %= 1e3, a2 += Math.trunc(i2 / 1e3), i2 %= 1e3, s2 = Math.trunc(a2 / 60), a2 %= 60;
          break;
        case "second":
          o2 = Math.trunc(r2 / 1e3), r2 %= 1e3, i2 = Math.trunc(o2 / 1e3), o2 %= 1e3, a2 += Math.trunc(i2 / 1e3), i2 %= 1e3;
          break;
        case "millisecond":
          o2 = Math.trunc(r2 / 1e3), r2 %= 1e3, i2 = he(a2, 3, Math.trunc(o2 / 1e3)), o2 %= 1e3, a2 = 0;
          break;
        case "microsecond":
          o2 = he(a2, 6, Math.trunc(r2 / 1e3)), r2 %= 1e3, a2 = 0;
          break;
        case "nanosecond":
          r2 = he(a2, 9, r2), a2 = 0;
      }
      return new (ce("%Temporal.Duration%"))(e2.date.years, e2.date.months, e2.date.weeks, e2.date.days + n2 * d2, n2 * c2, n2 * s2, n2 * a2, n2 * i2, n2 * o2, n2 * r2);
    }
    function Jr(e2, t2) {
      return Er(e2), t2.sign(), { date: e2, time: t2 };
    }
    function Gr(e2, t2, n2) {
      return yr({ isoDate: { year: e2, month: t2 + 1, day: n2 }, time: { hour: 0, minute: 0, second: 0, millisecond: 0 } }) / Re;
    }
    function Kr({ year: e2, month: t2, day: n2 }) {
      if (Math.abs(Gr(e2, t2 - 1, n2)) > 1e8) throw new RangeError("date/time value is outside the supported range");
    }
    function Vr(e2, t2) {
      const n2 = t2.hour - e2.hour, r2 = t2.minute - e2.minute, o2 = t2.second - e2.second, i2 = t2.millisecond - e2.millisecond, a2 = t2.microsecond - e2.microsecond, s2 = t2.nanosecond - e2.nanosecond;
      return TimeDuration.fromComponents(n2, r2, o2, i2, a2, s2);
    }
    function Xr(e2, t2, n2, r2, o2) {
      let i2 = TimeDuration.fromEpochNsDiff(t2, e2);
      return i2 = $o(i2, n2, r2, o2), Jr({ years: 0, months: 0, weeks: 0, days: 0 }, i2);
    }
    function Qr(e2, t2, n2, r2) {
      Zr(e2), Zr(t2);
      let o2 = Vr(e2.time, t2.time);
      const i2 = o2.sign(), a2 = Ro(e2.isoDate, t2.isoDate);
      let s2 = t2.isoDate;
      a2 === i2 && (s2 = Or(s2.year, s2.month, s2.day + i2), o2 = o2.add24HourDays(-i2));
      const c2 = Gt("day", r2), d2 = jn(n2, e2.isoDate, s2, c2);
      return r2 !== c2 && (o2 = o2.add24HourDays(d2.days), d2.days = 0), Jr(d2, o2);
    }
    function eo(n2, r2, o2, i2, a2) {
      const s2 = e.subtract(r2, n2);
      if (e.equal(s2, t)) return { date: { years: 0, months: 0, weeks: 0, days: 0 }, time: TimeDuration.ZERO };
      const c2 = e.lessThan(s2, t) ? -1 : 1, d2 = zn(o2, n2), h2 = zn(o2, r2);
      let u2, l2 = 0, m2 = 1 === c2 ? 2 : 1, f2 = Vr(d2.time, h2.time);
      for (f2.sign() === -c2 && l2++; l2 <= m2; l2++) {
        u2 = xt(Or(h2.isoDate.year, h2.isoDate.month, h2.isoDate.day - l2 * c2), d2.time);
        const e2 = An(o2, u2, "compatible");
        if (f2 = TimeDuration.fromEpochNsDiff(r2, e2), f2.sign() !== -c2) break;
      }
      const y2 = Gt("day", a2);
      return Jr(jn(i2, d2.isoDate, u2.isoDate, y2), f2);
    }
    function to(t2, n2, r2, o2, i2, a2, s2, c2, d2) {
      let h2, u2, l2, m2, f2 = n2;
      switch (c2) {
        case "year": {
          const e2 = Eo(f2.date.years, s2, "trunc");
          h2 = e2, u2 = e2 + s2 * t2, l2 = { years: h2, months: 0, weeks: 0, days: 0 }, m2 = { ...l2, years: u2 };
          break;
        }
        case "month": {
          const e2 = Eo(f2.date.months, s2, "trunc");
          h2 = e2, u2 = e2 + s2 * t2, l2 = Nt(f2.date, 0, 0, h2), m2 = Nt(f2.date, 0, 0, u2);
          break;
        }
        case "week": {
          const e2 = Nt(f2.date, 0, 0), n3 = Sn(a2, o2.isoDate, e2, "constrain"), r3 = jn(a2, n3, Or(n3.year, n3.month, n3.day + f2.date.days), "week"), i3 = Eo(f2.date.weeks + r3.weeks, s2, "trunc");
          h2 = i3, u2 = i3 + s2 * t2, l2 = Nt(f2.date, 0, h2), m2 = Nt(f2.date, 0, u2);
          break;
        }
        case "day": {
          const e2 = Eo(f2.date.days, s2, "trunc");
          h2 = e2, u2 = e2 + s2 * t2, l2 = Nt(f2.date, h2), m2 = Nt(f2.date, u2);
          break;
        }
      }
      const y2 = Sn(a2, o2.isoDate, l2, "constrain"), p2 = Sn(a2, o2.isoDate, m2, "constrain");
      let g2, w2;
      const v2 = xt(y2, o2.time), b2 = xt(p2, o2.time);
      i2 ? (g2 = An(i2, v2, "compatible"), w2 = An(i2, b2, "compatible")) : (g2 = pr(v2), w2 = pr(b2));
      const D2 = TimeDuration.fromEpochNsDiff(r2, g2), T2 = TimeDuration.fromEpochNsDiff(w2, g2), M2 = ue(d2, t2 < 0 ? "negative" : "positive"), E2 = D2.add(D2).abs().subtract(T2.abs()).sign(), I2 = Math.abs(h2) / s2 % 2 == 0, C2 = D2.isZero() ? Math.abs(h2) : D2.cmp(T2) ? le(Math.abs(h2), Math.abs(u2), E2, I2, M2) : Math.abs(u2), O2 = new TimeDuration(e.add(e.multiply(T2.totalNs, e.BigInt(h2)), e.multiply(D2.totalNs, e.BigInt(s2 * t2)))).fdiv(T2.totalNs), $2 = C2 === Math.abs(u2);
      return f2 = { date: $2 ? m2 : l2, time: TimeDuration.ZERO }, { nudgeResult: { duration: f2, nudgedEpochNs: $2 ? w2 : g2, didExpandCalendarUnit: $2 }, total: O2 };
    }
    function no(t2, n2, r2, o2, i2, a2, s2, c2, d2) {
      let h2 = t2;
      const u2 = Kt(c2) || o2 && "day" === c2, l2 = Ir(h2) < 0 ? -1 : 1;
      let m2;
      return u2 ? { nudgeResult: m2 } = to(l2, h2, n2, r2, o2, i2, s2, c2, d2) : m2 = o2 ? (function(t3, n3, r3, o3, i3, a3, s3, c3) {
        let d3 = n3;
        const h3 = Sn(i3, r3.isoDate, d3.date, "constrain"), u3 = xt(h3, r3.time), l3 = xt(Or(h3.year, h3.month, h3.day + t3), r3.time), m3 = An(o3, u3, "compatible"), f2 = An(o3, l3, "compatible"), y2 = TimeDuration.fromEpochNsDiff(f2, m3);
        if (y2.sign() !== t3) throw new RangeError("time zone returned inconsistent Instants");
        const p2 = e.BigInt(at[s3] * a3);
        let g2 = d3.time.round(p2, c3);
        const w2 = g2.subtract(y2), v2 = w2.sign() !== -t3;
        let b2, D2;
        return v2 ? (b2 = t3, g2 = w2.round(p2, c3), D2 = g2.addToEpochNs(f2)) : (b2 = 0, D2 = g2.addToEpochNs(m3)), { duration: Jr(Nt(d3.date, d3.date.days + b2), g2), nudgedEpochNs: D2, didExpandCalendarUnit: v2 };
      })(l2, h2, r2, o2, i2, s2, c2, d2) : (function(t3, n3, r3, o3, i3, a3) {
        let s3 = t3;
        const c3 = s3.time.add24HourDays(s3.date.days), d3 = c3.round(e.BigInt(o3 * at[i3]), a3), h3 = d3.subtract(c3), { quotient: u3 } = c3.divmod(Se), { quotient: l3 } = d3.divmod(Se), m3 = Math.sign(l3 - u3) === c3.sign(), f2 = h3.addToEpochNs(n3);
        let y2 = 0, p2 = d3;
        return "date" === Vt(r3) && (y2 = l3, p2 = d3.add(TimeDuration.fromComponents(24 * -l3, 0, 0, 0, 0, 0))), { duration: { date: Nt(s3.date, y2), time: p2 }, nudgedEpochNs: f2, didExpandCalendarUnit: m3 };
      })(h2, n2, a2, s2, c2, d2), h2 = m2.duration, m2.didExpandCalendarUnit && "week" !== c2 && (h2 = (function(e2, t3, n3, r3, o3, i3, a3, s3) {
        let c3 = t3;
        if (s3 === a3) return c3;
        const d3 = it.indexOf(a3);
        for (let t4 = it.indexOf(s3) - 1; t4 >= d3; t4--) {
          const s4 = it[t4];
          if ("week" === s4 && "week" !== a3) continue;
          let d4;
          switch (s4) {
            case "year":
              d4 = { years: c3.date.years + e2, months: 0, weeks: 0, days: 0 };
              break;
            case "month": {
              const t5 = c3.date.months + e2;
              d4 = Nt(c3.date, 0, 0, t5);
              break;
            }
            case "week": {
              const t5 = c3.date.weeks + e2;
              d4 = Nt(c3.date, 0, t5);
              break;
            }
          }
          const h3 = xt(Sn(i3, r3.isoDate, d4, "constrain"), r3.time);
          let u3;
          if (u3 = o3 ? An(o3, h3, "compatible") : pr(h3), p(n3, u3) === -e2) break;
          c3 = { date: d4, time: TimeDuration.ZERO };
        }
        return c3;
      })(l2, h2, m2.nudgedEpochNs, r2, o2, i2, a2, Gt(c2, "day"))), h2;
    }
    function ro(e2, t2, n2, r2, o2, i2) {
      return Kt(i2) || r2 && "day" === i2 ? to(Ir(e2) < 0 ? -1 : 1, e2, t2, n2, r2, o2, 1, i2, "trunc").total : Yo(e2.time.add24HourDays(e2.date.days), i2);
    }
    function oo(e2, t2, n2, r2, o2, i2, a2) {
      if (0 == jo(e2, t2)) return { date: { years: 0, months: 0, weeks: 0, days: 0 }, time: TimeDuration.ZERO };
      Br(e2), Br(t2);
      const s2 = Qr(e2, t2, n2, r2);
      return "nanosecond" === i2 && 1 === o2 ? s2 : no(s2, pr(t2), e2, null, n2, r2, o2, i2, a2);
    }
    function io(e2, t2, n2, r2, o2, i2, a2, s2) {
      if ("time" === Vt(o2)) return Xr(e2, t2, i2, a2, s2);
      const c2 = eo(e2, t2, n2, r2, o2);
      return "nanosecond" === a2 && 1 === i2 ? c2 : no(c2, t2, zn(n2, e2), n2, r2, o2, i2, a2, s2);
    }
    function ao(e2, t2, n2, r2, o2, i2) {
      const a2 = nt.reduce(((e3, t3) => {
        const o3 = t3[0], i3 = t3[1], a3 = t3[2];
        return "datetime" !== n2 && a3 !== n2 || r2.includes(i3) || e3.push(i3, o3), e3;
      }), []);
      let s2 = Wt(t2, "largestUnit", n2, "auto");
      if (r2.includes(s2)) throw new RangeError(`largestUnit must be one of ${a2.join(", ")}, not ${s2}`);
      const c2 = Ft(t2);
      let d2 = Ut(t2, "trunc");
      "since" === e2 && (d2 = (function(e3) {
        switch (e3) {
          case "ceil":
            return "floor";
          case "floor":
            return "ceil";
          case "halfCeil":
            return "halfFloor";
          case "halfFloor":
            return "halfCeil";
          default:
            return e3;
        }
      })(d2));
      const h2 = Wt(t2, "smallestUnit", n2, o2);
      if (r2.includes(h2)) throw new RangeError(`smallestUnit must be one of ${a2.join(", ")}, not ${h2}`);
      const u2 = Gt(i2, h2);
      if ("auto" === s2 && (s2 = u2), Gt(s2, h2) !== s2) throw new RangeError(`largestUnit ${s2} cannot be smaller than smallestUnit ${h2}`);
      const l2 = { hour: 24, minute: 60, second: 60, millisecond: 1e3, microsecond: 1e3, nanosecond: 1e3 }[h2];
      return void 0 !== l2 && Ht(c2, l2, false), { largestUnit: s2, roundingIncrement: c2, roundingMode: d2, smallestUnit: h2 };
    }
    function so(e2, t2, n2, r2) {
      const o2 = cn(n2), i2 = ao(e2, Zo(r2), "time", [], "nanosecond", "second");
      let a2 = _r(Xr(re(t2, b), re(o2, b), i2.roundingIncrement, i2.smallestUnit, i2.roundingMode), i2.largestUnit);
      return "since" === e2 && (a2 = Sr(a2)), a2;
    }
    function co(e2, t2, n2, r2) {
      const o2 = rn(n2), i2 = re(t2, E), a2 = re(o2, E);
      if (!xn(i2, a2)) throw new RangeError(`cannot compute difference between dates of ${i2} and ${a2} calendars`);
      const s2 = ao(e2, Zo(r2), "date", [], "day", "day"), c2 = ce("%Temporal.Duration%"), d2 = re(t2, D), h2 = re(o2, D);
      if (0 === Ro(d2, h2)) return new c2();
      let u2 = { date: jn(i2, d2, h2, s2.largestUnit), time: TimeDuration.ZERO };
      if ("day" !== s2.smallestUnit || 1 !== s2.roundingIncrement) {
        const e3 = xt(d2, { deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
        u2 = no(u2, pr(xt(h2, { deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })), e3, null, i2, s2.largestUnit, s2.roundingIncrement, s2.smallestUnit, s2.roundingMode);
      }
      let l2 = _r(u2, "day");
      return "since" === e2 && (l2 = Sr(l2)), l2;
    }
    function ho(e2, t2, n2, r2) {
      const o2 = an(n2), i2 = re(t2, E), a2 = re(o2, E);
      if (!xn(i2, a2)) throw new RangeError(`cannot compute difference between dates of ${i2} and ${a2} calendars`);
      const s2 = ao(e2, Zo(r2), "datetime", [], "nanosecond", "day"), c2 = ce("%Temporal.Duration%"), d2 = re(t2, T), h2 = re(o2, T);
      if (0 === jo(d2, h2)) return new c2();
      let u2 = _r(oo(d2, h2, i2, s2.largestUnit, s2.roundingIncrement, s2.smallestUnit, s2.roundingMode), s2.largestUnit);
      return "since" === e2 && (u2 = Sr(u2)), u2;
    }
    function uo(e2, t2, n2, r2) {
      const o2 = hn(n2), i2 = ao(e2, Zo(r2), "time", [], "nanosecond", "hour");
      let a2 = Vr(re(t2, M), re(o2, M));
      a2 = $o(a2, i2.roundingIncrement, i2.smallestUnit, i2.roundingMode);
      let s2 = _r(Jr({ years: 0, months: 0, weeks: 0, days: 0 }, a2), i2.largestUnit);
      return "since" === e2 && (s2 = Sr(s2)), s2;
    }
    function lo(e2, t2, n2, r2) {
      const o2 = ln(n2), i2 = re(t2, E), a2 = re(o2, E);
      if (!xn(i2, a2)) throw new RangeError(`cannot compute difference between months of ${i2} and ${a2} calendars`);
      const s2 = ao(e2, Zo(r2), "date", ["week", "day"], "month", "year"), c2 = ce("%Temporal.Duration%");
      if (0 == Ro(re(t2, D), re(o2, D))) return new c2();
      const d2 = en(i2, re(t2, D), "year-month");
      d2.day = 1;
      const h2 = Ln(i2, d2, "constrain"), u2 = en(i2, re(o2, D), "year-month");
      u2.day = 1;
      const l2 = Ln(i2, u2, "constrain");
      let m2 = { date: Nt(jn(i2, h2, l2, s2.largestUnit), 0, 0), time: TimeDuration.ZERO };
      if ("month" !== s2.smallestUnit || 1 !== s2.roundingIncrement) {
        const e3 = xt(h2, { deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
        m2 = no(m2, pr(xt(l2, { deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })), e3, null, i2, s2.largestUnit, s2.roundingIncrement, s2.smallestUnit, s2.roundingMode);
      }
      let f2 = _r(m2, "day");
      return "since" === e2 && (f2 = Sr(f2)), f2;
    }
    function mo(t2, n2, r2, o2) {
      const i2 = fn(r2), a2 = re(n2, E), s2 = re(i2, E);
      if (!xn(a2, s2)) throw new RangeError(`cannot compute difference between dates of ${a2} and ${s2} calendars`);
      const c2 = ao(t2, Zo(o2), "datetime", [], "nanosecond", "hour"), d2 = re(n2, b), h2 = re(i2, b), u2 = ce("%Temporal.Duration%");
      let l2;
      if ("date" !== Vt(c2.largestUnit)) l2 = _r(Xr(d2, h2, c2.roundingIncrement, c2.smallestUnit, c2.roundingMode), c2.largestUnit);
      else {
        const t3 = re(n2, $);
        if (!Zn(t3, re(i2, $))) throw new RangeError("When calculating difference between time zones, largestUnit must be 'hours' or smaller because day lengths can vary between time zones due to DST or time zone offset changes.");
        if (e.equal(d2, h2)) return new u2();
        l2 = _r(io(d2, h2, t3, a2, c2.largestUnit, c2.roundingIncrement, c2.smallestUnit, c2.roundingMode), "hour");
      }
      return "since" === t2 && (l2 = Sr(l2)), l2;
    }
    function fo({ hour: e2, minute: t2, second: n2, millisecond: r2, microsecond: o2, nanosecond: i2 }, a2) {
      let s2 = n2, c2 = i2;
      return s2 += a2.sec, c2 += a2.subsec, Yr(e2, t2, s2, r2, o2, c2);
    }
    function yo(e2, t2) {
      const n2 = t2.addToEpochNs(e2);
      return Fr(n2), n2;
    }
    function po(e2, t2, n2, r2, o2 = "constrain") {
      if (0 === Er(r2.date)) return yo(e2, r2.time);
      const i2 = zn(t2, e2);
      return yo(An(t2, xt(Sn(n2, i2.isoDate, r2.date, o2), i2.time), "compatible"), r2.time);
    }
    function go(e2, t2, n2) {
      let r2 = sn(n2);
      "subtract" === e2 && (r2 = Sr(r2));
      const o2 = Gt(Jt(t2), Jt(r2));
      if (Kt(o2)) throw new RangeError("For years, months, or weeks arithmetic, use date arithmetic relative to a starting point");
      const i2 = qr(t2), a2 = qr(r2);
      return _r(Jr({ years: 0, months: 0, weeks: 0, days: 0 }, i2.time.add(a2.time)), o2);
    }
    function wo(e2, t2, n2) {
      let r2 = sn(n2);
      "subtract" === e2 && (r2 = Sr(r2));
      const o2 = Jt(r2);
      if ("date" === Vt(o2)) throw new RangeError(`Duration field ${o2} not supported by Temporal.Instant. Try Temporal.ZonedDateTime instead.`);
      const i2 = qr(r2);
      return Cn(yo(re(t2, b), i2.time));
    }
    function vo(e2, t2, n2, r2) {
      const o2 = re(t2, E);
      let i2 = sn(n2);
      "subtract" === e2 && (i2 = Sr(i2));
      const a2 = Wr(i2), s2 = Lt(Zo(r2));
      return pn(Sn(o2, re(t2, D), a2, s2), o2);
    }
    function bo(e2, t2, n2, r2) {
      let o2 = sn(n2);
      "subtract" === e2 && (o2 = Sr(o2));
      const i2 = Lt(Zo(r2)), a2 = re(t2, E), s2 = qr(o2), c2 = re(t2, T), d2 = fo(c2.time, s2.time), h2 = Nt(s2.date, d2.deltaDays);
      return zr(h2.years, h2.months, h2.weeks, h2.days, 0, 0, 0, 0, 0, 0), wn(xt(Sn(a2, c2.isoDate, h2, i2), d2), a2);
    }
    function Do(e2, t2, n2) {
      let r2 = sn(n2);
      "subtract" === e2 && (r2 = Sr(r2));
      const o2 = qr(r2), { hour: i2, minute: a2, second: s2, millisecond: c2, microsecond: d2, nanosecond: h2 } = fo(re(t2, M), o2.time);
      return Tn(jt(i2, a2, s2, c2, d2, h2, "reject"));
    }
    function To(e2, t2, n2, r2) {
      let o2 = sn(n2);
      "subtract" === e2 && (o2 = Sr(o2));
      const i2 = Lt(Zo(r2)), a2 = Mr(o2), s2 = re(t2, E), c2 = en(s2, re(t2, D), "year-month");
      c2.day = 1;
      let d2 = Ln(s2, c2, "constrain");
      if (a2 < 0) {
        const e3 = Sn(s2, d2, { months: 1 }, "constrain");
        d2 = Or(e3.year, e3.month, e3.day - 1);
      }
      const h2 = Wr(o2);
      return Lr(d2), En(Pn(s2, en(s2, Sn(s2, d2, h2, i2), "year-month"), i2), s2);
    }
    function Mo(e2, t2, n2, r2) {
      let o2 = sn(n2);
      "subtract" === e2 && (o2 = Sr(o2));
      const i2 = Lt(Zo(r2)), a2 = re(t2, $), s2 = re(t2, E), c2 = Ar(o2);
      return $n(po(re(t2, b), a2, s2, c2, i2), a2, s2);
    }
    function Eo(e2, t2, n2) {
      const r2 = Math.trunc(e2 / t2), o2 = e2 % t2, i2 = e2 < 0 ? "negative" : "positive", a2 = Math.abs(r2), s2 = a2 + 1, c2 = Bo(Math.abs(2 * o2) - t2), d2 = a2 % 2 == 0, h2 = ue(n2, i2), u2 = 0 === o2 ? a2 : le(a2, s2, c2, d2, h2);
      return t2 * ("positive" === i2 ? u2 : -u2);
    }
    function Io(o2, i2, a2, s2) {
      const c2 = at[a2] * i2;
      return (function(o3, i3, a3) {
        const s3 = m(o3), c3 = m(i3), d2 = e.divide(s3, c3), h2 = e.remainder(s3, c3), u2 = ue(a3, "positive");
        let l2, g2;
        e.lessThan(s3, t) ? (l2 = e.subtract(d2, n), g2 = d2) : (l2 = d2, g2 = e.add(d2, n));
        const w2 = p(y(e.multiply(h2, r)), c3) * (e.lessThan(s3, t) ? -1 : 1) + 0, v2 = e.equal(h2, t) ? d2 : le(l2, g2, w2, f(l2), u2);
        return e.multiply(v2, c3);
      })(o2, e.BigInt(c2), s2);
    }
    function Co(e2, t2, n2, r2) {
      Zr(e2);
      const { year: o2, month: i2, day: a2 } = e2.isoDate, s2 = Oo(e2.time, t2, n2, r2);
      return xt(Or(o2, i2, a2 + s2.deltaDays), s2);
    }
    function Oo({ hour: e2, minute: t2, second: n2, millisecond: r2, microsecond: o2, nanosecond: i2 }, a2, s2, c2) {
      let d2;
      switch (s2) {
        case "day":
        case "hour":
          d2 = 1e3 * (1e3 * (1e3 * (60 * (60 * e2 + t2) + n2) + r2) + o2) + i2;
          break;
        case "minute":
          d2 = 1e3 * (1e3 * (1e3 * (60 * t2 + n2) + r2) + o2) + i2;
          break;
        case "second":
          d2 = 1e3 * (1e3 * (1e3 * n2 + r2) + o2) + i2;
          break;
        case "millisecond":
          d2 = 1e3 * (1e3 * r2 + o2) + i2;
          break;
        case "microsecond":
          d2 = 1e3 * o2 + i2;
          break;
        case "nanosecond":
          d2 = i2;
      }
      const h2 = at[s2], u2 = Eo(d2, h2 * a2, c2) / h2;
      switch (s2) {
        case "day":
          return { deltaDays: u2, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 };
        case "hour":
          return Yr(u2, 0, 0, 0, 0, 0);
        case "minute":
          return Yr(e2, u2, 0, 0, 0, 0);
        case "second":
          return Yr(e2, t2, u2, 0, 0, 0);
        case "millisecond":
          return Yr(e2, t2, n2, u2, 0, 0);
        case "microsecond":
          return Yr(e2, t2, n2, r2, u2, 0);
        case "nanosecond":
          return Yr(e2, t2, n2, r2, o2, u2);
        default:
          throw new Error(`Invalid unit ${s2}`);
      }
    }
    function $o(t2, n2, r2, o2) {
      const i2 = at[r2];
      return t2.round(e.BigInt(i2 * n2), o2);
    }
    function Yo(t2, n2) {
      const r2 = at[n2];
      return t2.fdiv(e.BigInt(r2));
    }
    function Ro(e2, t2) {
      return e2.year !== t2.year ? Bo(e2.year - t2.year) : e2.month !== t2.month ? Bo(e2.month - t2.month) : e2.day !== t2.day ? Bo(e2.day - t2.day) : 0;
    }
    function So(e2, t2) {
      return e2.hour !== t2.hour ? Bo(e2.hour - t2.hour) : e2.minute !== t2.minute ? Bo(e2.minute - t2.minute) : e2.second !== t2.second ? Bo(e2.second - t2.second) : e2.millisecond !== t2.millisecond ? Bo(e2.millisecond - t2.millisecond) : e2.microsecond !== t2.microsecond ? Bo(e2.microsecond - t2.microsecond) : e2.nanosecond !== t2.nanosecond ? Bo(e2.nanosecond - t2.nanosecond) : 0;
    }
    function jo(e2, t2) {
      const n2 = Ro(e2.isoDate, t2.isoDate);
      return 0 !== n2 ? n2 : So(e2.time, t2.time);
    }
    function ko(e2) {
      const t2 = Lo(e2);
      return void 0 !== globalThis.BigInt ? globalThis.BigInt(t2.toString(10)) : t2;
    }
    function No(t2, n2) {
      const r2 = m(t2), { quotient: o2, remainder: i2 } = g(r2, c);
      let a2 = e.toNumber(o2);
      return "floor" === n2 && e.toNumber(i2) < 0 && (a2 -= 1), "ceil" === n2 && e.toNumber(i2) > 0 && (a2 += 1), a2;
    }
    function xo(t2) {
      if (!Number.isInteger(t2)) throw new RangeError("epoch milliseconds must be an integer");
      return e.multiply(e.BigInt(t2), c);
    }
    function Lo(t2) {
      let n2 = t2;
      if ("object" == typeof t2) {
        const e2 = t2[Symbol.toPrimitive];
        e2 && "function" == typeof e2 && (n2 = e2.call(t2, "number"));
      }
      if ("number" == typeof n2) throw new TypeError("cannot convert number to bigint");
      return "bigint" == typeof n2 ? e.BigInt(n2.toString(10)) : e.BigInt(n2);
    }
    var Po = (() => {
      let t2 = e.BigInt(Date.now() % 1e6);
      return () => {
        const n2 = Date.now(), r2 = e.BigInt(n2), o2 = e.add(xo(n2), t2);
        return t2 = e.remainder(r2, c), e.greaterThan(o2, Ne) ? Ne : e.lessThan(o2, xe) ? xe : o2;
      };
    })();
    function Uo() {
      return new Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    function Bo(e2) {
      return e2 < 0 ? -1 : e2 > 0 ? 1 : e2;
    }
    function Zo(e2) {
      if (void 0 === e2) return /* @__PURE__ */ Object.create(null);
      if (Ae(e2) && null !== e2) return e2;
      throw new TypeError("Options parameter must be an object, not " + (null === e2 ? "null" : typeof e2));
    }
    function Fo(e2, t2) {
      const n2 = /* @__PURE__ */ Object.create(null);
      return n2[e2] = t2, n2;
    }
    function Ho(e2, t2, n2, r2) {
      let o2 = e2[t2];
      if (void 0 !== o2) {
        if (o2 = We(o2), !n2.includes(o2)) throw new RangeError(`${t2} must be one of ${n2.join(", ")}, not ${o2}`);
        return o2;
      }
      if (r2 === qt) throw new RangeError(`${t2} option is required`);
      return r2;
    }
    function zo(e2) {
      const t2 = Ao(e2);
      if (!He.includes(Ao(t2))) throw new RangeError(`invalid calendar identifier ${t2}`);
      switch (t2) {
        case "ethiopic-amete-alem":
          return "ethioaa";
        case "islamicc":
          return "islamic-civil";
      }
      return t2;
    }
    function Ao(e2) {
      let t2 = "";
      for (let n2 = 0; n2 < e2.length; n2++) {
        const r2 = e2.charCodeAt(n2);
        t2 += r2 >= 65 && r2 <= 90 ? String.fromCharCode(r2 + 32) : String.fromCharCode(r2);
      }
      return t2;
    }
    function qo(e2) {
      throw new TypeError(`Do not use built-in arithmetic operators with Temporal objects. When comparing, use ${"PlainMonthDay" === e2 ? "Temporal.PlainDate.compare(obj1.toPlainDate(year), obj2.toPlainDate(year))" : `Temporal.${e2}.compare(obj1, obj2)`}, not obj1 > obj2. When coercing to strings, use \`\${obj}\` or String(obj), not '' + obj. When coercing to numbers, use properties or methods of the object, not \`+obj\`. When concatenating with strings, use \`\${str}\${obj}\` or str.concat(obj), not str + obj. In React, coerce to a string before rendering a Temporal object.`);
    }
    var Wo = new RegExp(`^${be.source}$`);
    var _o = new RegExp(`^${/([+-])([01][0-9]|2[0-3])(?::?([0-5][0-9])(?::?([0-5][0-9])(?:[.,](\d{1,9}))?)?)?/.source}$`);
    function Jo(e2, t2, n2, r2 = e2(t2), o2 = e2(n2)) {
      let i2 = t2, a2 = n2, s2 = r2, c2 = o2;
      for (; a2 - i2 > 1; ) {
        let t3 = Math.trunc((i2 + a2) / 2);
        const n3 = e2(t3);
        n3 === s2 ? (i2 = t3, s2 = n3) : n3 === c2 && (a2 = t3, c2 = n3);
      }
      return a2;
    }
    function Go(e2) {
      return [...e2];
    }
    function Ko(e2, t2) {
      if ("gregory" !== e2 && "iso8601" !== e2) return;
      const n2 = Xo[e2];
      let r2 = t2.year;
      const { dayOfWeek: o2, dayOfYear: i2, daysInYear: a2 } = n2.isoToDate(t2, { dayOfWeek: true, dayOfYear: true, daysInYear: true }), s2 = n2.getFirstDayOfWeek(), c2 = n2.getMinimalDaysInFirstWeek();
      let d2 = (o2 + 7 - s2) % 7, h2 = (o2 - i2 + 7001 - s2) % 7, u2 = Math.floor((i2 - 1 + h2) / 7);
      if (7 - h2 >= c2 && ++u2, 0 == u2) u2 = (function(e3, t3, n3, r3) {
        let o3 = (r3 - e3 - n3 + 1) % 7;
        o3 < 0 && (o3 += 7);
        let i3 = Math.floor((n3 + o3 - 1) / 7);
        return 7 - o3 >= t3 && ++i3, i3;
      })(s2, c2, i2 + n2.isoToDate(n2.dateAdd(t2, { years: -1 }, "constrain"), { daysInYear: true }).daysInYear, o2), r2--;
      else if (i2 >= a2 - 5) {
        let e3 = (d2 + a2 - i2) % 7;
        e3 < 0 && (e3 += 7), 6 - e3 >= c2 && i2 + 7 - d2 > a2 && (u2 = 1, r2++);
      }
      return { week: u2, year: r2 };
    }
    function Vo(e2, t2, n2, r2, o2) {
      if (t2 !== o2.year) {
        if (e2 * (t2 - o2.year) > 0) return true;
      } else if (n2 !== o2.month) {
        if (e2 * (n2 - o2.month) > 0) return true;
      } else if (r2 !== o2.day && e2 * (r2 - o2.day) > 0) return true;
      return false;
    }
    var Xo = {};
    function Qo(e2) {
      if (!e2.startsWith("M")) throw new RangeError(`Invalid month code: ${e2}.  Month codes must start with M.`);
      const t2 = +e2.slice(1);
      if (Number.isNaN(t2)) throw new RangeError(`Invalid month code: ${e2}`);
      return t2;
    }
    function ei(e2, t2 = false) {
      return `M${`${e2}`.padStart(2, "0")}${t2 ? "L" : ""}`;
    }
    function ti(e2, t2 = void 0, n2 = 12) {
      let { month: r2, monthCode: o2 } = e2;
      if (void 0 === o2) {
        if (void 0 === r2) throw new TypeError("Either month or monthCode are required");
        "reject" === t2 && Nr(r2, 1, n2), "constrain" === t2 && (r2 = jr(r2, 1, n2)), o2 = ei(r2);
      } else {
        const e3 = Qo(o2);
        if (o2 !== ei(e3)) throw new RangeError(`Invalid month code: ${o2}`);
        if (void 0 !== r2 && r2 !== e3) throw new RangeError(`monthCode ${o2} and month ${r2} must match if both are present`);
        if (r2 = e3, r2 < 1 || r2 > n2) throw new RangeError(`Invalid monthCode: ${o2}`);
      }
      return { ...e2, month: r2, monthCode: o2 };
    }
    Xo.iso8601 = { resolveFields(e2, t2) {
      if (("date" === t2 || "year-month" === t2) && void 0 === e2.year) throw new TypeError("year is required");
      if (("date" === t2 || "month-day" === t2) && void 0 === e2.day) throw new TypeError("day is required");
      Object.assign(e2, ti(e2));
    }, dateToISO: (e2, t2) => St(e2.year, e2.month, e2.day, t2), monthDayToISOReferenceDate(e2, t2) {
      const { month: n2, day: r2 } = St(e2.year ?? 1972, e2.month, e2.day, t2);
      return { month: n2, day: r2, year: 1972 };
    }, extraFields: () => [], fieldKeysToIgnore(e2) {
      const t2 = /* @__PURE__ */ new Set();
      for (let n2 = 0; n2 < e2.length; n2++) {
        const r2 = e2[n2];
        t2.add(r2), "month" === r2 ? t2.add("monthCode") : "monthCode" === r2 && t2.add("month");
      }
      return Go(t2);
    }, dateAdd(e2, { years: t2 = 0, months: n2 = 0, weeks: r2 = 0, days: o2 = 0 }, i2) {
      let { year: a2, month: s2, day: c2 } = e2;
      return a2 += t2, s2 += n2, { year: a2, month: s2 } = Cr(a2, s2), { year: a2, month: s2, day: c2 } = St(a2, s2, c2, i2), c2 += o2 + 7 * r2, Or(a2, s2, c2);
    }, dateUntil(e2, t2, n2) {
      const r2 = -Ro(e2, t2);
      if (0 === r2) return { years: 0, months: 0, weeks: 0, days: 0 };
      let o2, i2 = 0, a2 = 0;
      if ("year" === n2 || "month" === n2) {
        let s3 = t2.year - e2.year;
        for (0 !== s3 && (s3 -= r2); !Vo(r2, e2.year + s3, e2.month, e2.day, t2); ) i2 = s3, s3 += r2;
        let c3 = r2;
        for (o2 = Cr(e2.year + i2, e2.month + c3); !Vo(r2, o2.year, o2.month, e2.day, t2); ) a2 = c3, c3 += r2, o2 = Cr(o2.year, o2.month + r2);
        "month" === n2 && (a2 += 12 * i2, i2 = 0);
      }
      o2 = Cr(e2.year + i2, e2.month + a2);
      const s2 = kr(o2.year, o2.month, e2.day);
      let c2 = 0, d2 = Gr(t2.year, t2.month - 1, t2.day) - Gr(s2.year, s2.month - 1, s2.day);
      return "week" === n2 && (c2 = Math.trunc(d2 / 7), d2 %= 7), { years: i2, months: a2, weeks: c2, days: d2 };
    }, isoToDate({ year: e2, month: t2, day: n2 }, r2) {
      const o2 = { era: void 0, eraYear: void 0, year: e2, month: t2, day: n2, daysInWeek: 7, monthsInYear: 12 };
      if (r2.monthCode && (o2.monthCode = ei(t2)), r2.dayOfWeek) {
        const r3 = t2 + (t2 < 3 ? 10 : -2), i2 = e2 - (t2 < 3 ? 1 : 0), a2 = Math.floor(i2 / 100), s2 = i2 - 100 * a2, c2 = (n2 + Math.floor(2.6 * r3 - 0.2) + (s2 + Math.floor(s2 / 4)) + (Math.floor(a2 / 4) - 2 * a2)) % 7;
        o2.dayOfWeek = c2 + (c2 <= 0 ? 7 : 0);
      }
      if (r2.dayOfYear) {
        let r3 = n2;
        for (let n3 = t2 - 1; n3 > 0; n3--) r3 += Tr(e2, n3);
        o2.dayOfYear = r3;
      }
      return r2.weekOfYear && (o2.weekOfYear = Ko("iso8601", { year: e2, month: t2, day: n2 })), r2.daysInMonth && (o2.daysInMonth = Tr(e2, t2)), (r2.daysInYear || r2.inLeapYear) && (o2.inLeapYear = Dr(e2), o2.daysInYear = o2.inLeapYear ? 366 : 365), o2;
    }, getFirstDayOfWeek: () => 1, getMinimalDaysInFirstWeek: () => 4 };
    var OneObjectCache = class _OneObjectCache {
      constructor(e2) {
        if (this.map = /* @__PURE__ */ new Map(), this.calls = 0, this.hits = 0, this.misses = 0, void 0 !== e2) {
          let t2 = 0;
          for (const n2 of e2.map.entries()) {
            if (++t2 > _OneObjectCache.MAX_CACHE_ENTRIES) break;
            this.map.set(...n2);
          }
        }
      }
      get(e2) {
        const t2 = this.map.get(e2);
        return t2 && (this.hits++, this.report()), this.calls++, t2;
      }
      set(e2, t2) {
        this.map.set(e2, t2), this.misses++, this.report();
      }
      report() {
      }
      setObject(e2) {
        if (_OneObjectCache.objectMap.get(e2)) throw new RangeError("object already cached");
        _OneObjectCache.objectMap.set(e2, this), this.report();
      }
      static getCacheForObject(e2) {
        let t2 = _OneObjectCache.objectMap.get(e2);
        return t2 || (t2 = new _OneObjectCache(), _OneObjectCache.objectMap.set(e2, t2)), t2;
      }
    };
    function ni({ isoYear: e2, isoMonth: t2, isoDay: n2 }) {
      return `${Jn(e2)}-${Gn(t2)}-${Gn(n2)}T00:00Z`;
    }
    function ri(e2, t2) {
      return { years: e2.year - t2.year, months: e2.month - t2.month, days: e2.day - t2.day };
    }
    OneObjectCache.objectMap = /* @__PURE__ */ new WeakMap(), OneObjectCache.MAX_CACHE_ENTRIES = 1e3;
    var HelperBase = class {
      constructor() {
        this.eras = [], this.hasEra = false, this.erasBeginMidYear = false;
      }
      getFormatter() {
        return void 0 === this.formatter && (this.formatter = new Intl.DateTimeFormat(`en-US-u-ca-${this.id}`, { day: "numeric", month: "numeric", year: "numeric", era: "short", timeZone: "UTC" })), this.formatter;
      }
      getCalendarParts(e2) {
        let t2 = this.getFormatter(), n2 = new Date(e2);
        if ("-271821-04-19T00:00Z" === e2) {
          const e3 = t2.resolvedOptions();
          t2 = new Intl.DateTimeFormat(e3.locale, { ...e3, timeZone: "Etc/GMT+1" }), n2 = /* @__PURE__ */ new Date("-271821-04-20T00:00Z");
        }
        try {
          return t2.formatToParts(n2);
        } catch (t3) {
          throw new RangeError(`Invalid ISO date: ${e2}`);
        }
      }
      isoToCalendarDate(e2, t2) {
        const { year: n2, month: r2, day: o2 } = e2, i2 = JSON.stringify({ func: "isoToCalendarDate", isoYear: n2, isoMonth: r2, isoDay: o2, id: this.id }), a2 = t2.get(i2);
        if (a2) return a2;
        const s2 = ni({ isoYear: n2, isoMonth: r2, isoDay: o2 }), c2 = this.getCalendarParts(s2), d2 = {};
        for (let e3 = 0; e3 < c2.length; e3++) {
          const { type: t3, value: n3 } = c2[e3];
          if ("year" !== t3 && "relatedYear" !== t3 || (this.hasEra ? d2.eraYear = +n3 : d2.year = +n3), "month" === t3) {
            const e4 = /^([0-9]*)(.*?)$/.exec(n3);
            if (!e4 || 3 != e4.length || !e4[1] && !e4[2]) throw new RangeError(`Unexpected month: ${n3}`);
            if (d2.month = e4[1] ? +e4[1] : 1, d2.month < 1) throw new RangeError(`Invalid month ${n3} from ${s2}[u-ca-${this.id}] (probably due to https://bugs.chromium.org/p/v8/issues/detail?id=10527)`);
            if (d2.month > 13) throw new RangeError(`Invalid month ${n3} from ${s2}[u-ca-${this.id}] (probably due to https://bugs.chromium.org/p/v8/issues/detail?id=10529)`);
            e4[2] && (d2.monthExtra = e4[2]);
          }
          "day" === t3 && (d2.day = +n3), this.hasEra && "era" === t3 && null != n3 && "" !== n3 && (d2.era = n3.split(" (")[0].normalize("NFD").replace(/[^-0-9 \p{L}]/gu, "").replace(/ /g, "-").toLowerCase());
        }
        if (this.hasEra && void 0 === d2.eraYear) throw new RangeError(`Intl.DateTimeFormat.formatToParts lacks relatedYear in ${this.id} calendar. Try Node 14+ or modern browsers.`);
        if (this.hasEra) {
          const e3 = this.eras.find(((e4) => d2.era === e4.genericName));
          e3 && (d2.era = e3.code);
        }
        if (this.reviseIntlEra) {
          const { era: t3, eraYear: n3 } = this.reviseIntlEra(d2, e2);
          d2.era = t3, d2.eraYear = n3;
        }
        this.checkIcuBugs && this.checkIcuBugs(e2);
        const h2 = this.adjustCalendarDate(d2, t2, "constrain", true);
        if (void 0 === h2.year) throw new RangeError(`Missing year converting ${JSON.stringify(e2)}`);
        if (void 0 === h2.month) throw new RangeError(`Missing month converting ${JSON.stringify(e2)}`);
        if (void 0 === h2.day) throw new RangeError(`Missing day converting ${JSON.stringify(e2)}`);
        return t2.set(i2, h2), ["constrain", "reject"].forEach(((n3) => {
          const r3 = JSON.stringify({ func: "calendarToIsoDate", year: h2.year, month: h2.month, day: h2.day, overflow: n3, id: this.id });
          t2.set(r3, e2);
        })), h2;
      }
      validateCalendarDate(e2) {
        const { month: t2, year: n2, day: r2, eraYear: o2, monthCode: i2, monthExtra: a2 } = e2;
        if (void 0 !== a2) throw new RangeError("Unexpected `monthExtra` value");
        if (void 0 === n2 && void 0 === o2) throw new TypeError("year or eraYear is required");
        if (void 0 === t2 && void 0 === i2) throw new TypeError("month or monthCode is required");
        if (void 0 === r2) throw new RangeError("Missing day");
        if (void 0 !== i2) {
          if ("string" != typeof i2) throw new RangeError("monthCode must be a string, not " + typeof i2);
          if (!/^M([01]?\d)(L?)$/.test(i2)) throw new RangeError(`Invalid monthCode: ${i2}`);
        }
        if (this.hasEra && void 0 === e2.era != (void 0 === e2.eraYear)) throw new TypeError("properties era and eraYear must be provided together");
      }
      adjustCalendarDate(e2, t2 = void 0, n2 = "constrain", r2 = false) {
        if ("lunisolar" === this.calendarType) throw new RangeError("Override required for lunisolar calendars");
        let o2 = e2;
        this.validateCalendarDate(o2);
        const i2 = this.monthsInYear(o2, t2);
        let { month: a2, monthCode: s2 } = o2;
        return { month: a2, monthCode: s2 } = ti(o2, n2, i2), { ...o2, month: a2, monthCode: s2 };
      }
      regulateMonthDayNaive(e2, t2, n2) {
        const r2 = this.monthsInYear(e2, n2);
        let { month: o2, day: i2 } = e2;
        return "reject" === t2 ? (Nr(o2, 1, r2), Nr(i2, 1, this.maximumMonthLength(e2))) : (o2 = jr(o2, 1, r2), i2 = jr(i2, 1, this.maximumMonthLength({ ...e2, month: o2 }))), { ...e2, month: o2, day: i2 };
      }
      calendarToIsoDate(e2, t2 = "constrain", n2) {
        const r2 = e2;
        let o2 = this.adjustCalendarDate(e2, n2, t2, false);
        o2 = this.regulateMonthDayNaive(o2, t2, n2);
        const { year: i2, month: a2, day: s2 } = o2, c2 = JSON.stringify({ func: "calendarToIsoDate", year: i2, month: a2, day: s2, overflow: t2, id: this.id });
        let d2, h2 = n2.get(c2);
        if (h2) return h2;
        if (void 0 !== r2.year && void 0 !== r2.month && void 0 !== r2.day && (r2.year !== o2.year || r2.month !== o2.month || r2.day !== o2.day) && (d2 = JSON.stringify({ func: "calendarToIsoDate", year: r2.year, month: r2.month, day: r2.day, overflow: t2, id: this.id }), h2 = n2.get(d2), h2)) return h2;
        let u2 = this.estimateIsoDate({ year: i2, month: a2, day: s2 });
        const l2 = (e3) => {
          let r3 = this.addDaysIso(u2, e3);
          if (o2.day > this.minimumMonthLength(o2)) {
            let e4 = this.isoToCalendarDate(r3, n2);
            for (; e4.month !== a2 || e4.year !== i2; ) {
              if ("reject" === t2) throw new RangeError(`day ${s2} does not exist in month ${a2} of year ${i2}`);
              r3 = this.addDaysIso(r3, -1), e4 = this.isoToCalendarDate(r3, n2);
            }
          }
          return r3;
        };
        let m2 = 0, f2 = this.isoToCalendarDate(u2, n2), y2 = ri(o2, f2);
        if (0 !== y2.years || 0 !== y2.months || 0 !== y2.days) {
          const e3 = 365 * y2.years + 30 * y2.months + y2.days;
          u2 = this.addDaysIso(u2, e3), f2 = this.isoToCalendarDate(u2, n2), y2 = ri(o2, f2), 0 === y2.years && 0 === y2.months ? u2 = l2(y2.days) : m2 = this.compareCalendarDates(o2, f2);
        }
        let p2 = 8;
        for (; m2; ) {
          u2 = this.addDaysIso(u2, m2 * p2);
          const e3 = f2;
          f2 = this.isoToCalendarDate(u2, n2);
          const i3 = m2;
          if (m2 = this.compareCalendarDates(o2, f2), m2) {
            if (y2 = ri(o2, f2), 0 === y2.years && 0 === y2.months) u2 = l2(y2.days), m2 = 0;
            else if (i3 && m2 !== i3) if (p2 > 1) p2 /= 2;
            else {
              if ("reject" === t2) throw new RangeError(`Can't find ISO date from calendar date: ${JSON.stringify({ ...r2 })}`);
              this.compareCalendarDates(f2, e3) > 0 && (u2 = this.addDaysIso(u2, -1)), m2 = 0;
            }
          }
        }
        if (n2.set(c2, u2), d2 && n2.set(d2, u2), void 0 === o2.year || void 0 === o2.month || void 0 === o2.day || void 0 === o2.monthCode || this.hasEra && (void 0 === o2.era || void 0 === o2.eraYear)) throw new RangeError("Unexpected missing property");
        return u2;
      }
      compareCalendarDates(e2, t2) {
        return e2.year !== t2.year ? Bo(e2.year - t2.year) : e2.month !== t2.month ? Bo(e2.month - t2.month) : e2.day !== t2.day ? Bo(e2.day - t2.day) : 0;
      }
      regulateDate(e2, t2 = "constrain", n2) {
        const r2 = this.calendarToIsoDate(e2, t2, n2);
        return this.isoToCalendarDate(r2, n2);
      }
      addDaysIso(e2, t2) {
        return Or(e2.year, e2.month, e2.day + t2);
      }
      addDaysCalendar(e2, t2, n2) {
        const r2 = this.calendarToIsoDate(e2, "constrain", n2), o2 = this.addDaysIso(r2, t2);
        return this.isoToCalendarDate(o2, n2);
      }
      addMonthsCalendar(e2, t2, n2, r2) {
        let o2 = e2;
        const { day: i2 } = o2;
        for (let e3 = 0, n3 = Math.abs(t2); e3 < n3; e3++) {
          const { month: e4 } = o2, n4 = o2, a2 = t2 < 0 ? -Math.max(i2, this.daysInPreviousMonth(o2, r2)) : this.daysInMonth(o2, r2), s2 = this.calendarToIsoDate(o2, "constrain", r2);
          let c2 = this.addDaysIso(s2, a2);
          if (o2 = this.isoToCalendarDate(c2, r2), t2 > 0) {
            const t3 = this.monthsInYear(n4, r2);
            for (; o2.month - 1 != e4 % t3; ) c2 = this.addDaysIso(c2, -1), o2 = this.isoToCalendarDate(c2, r2);
          }
          o2.day !== i2 && (o2 = this.regulateDate({ ...o2, day: i2 }, "constrain", r2));
        }
        if ("reject" === n2 && o2.day !== i2) throw new RangeError(`Day ${i2} does not exist in resulting calendar month`);
        return o2;
      }
      addCalendar(e2, { years: t2 = 0, months: n2 = 0, weeks: r2 = 0, days: o2 = 0 }, i2, a2) {
        const { year: s2, day: c2, monthCode: d2 } = e2, h2 = this.adjustCalendarDate({ year: s2 + t2, monthCode: d2, day: c2 }, a2), u2 = this.addMonthsCalendar(h2, n2, i2, a2), l2 = o2 + 7 * r2;
        return this.addDaysCalendar(u2, l2, a2);
      }
      untilCalendar(e2, t2, n2, r2) {
        let o2 = 0, i2 = 0, a2 = 0, s2 = 0;
        switch (n2) {
          case "day":
            o2 = this.calendarDaysUntil(e2, t2, r2);
            break;
          case "week": {
            const n3 = this.calendarDaysUntil(e2, t2, r2);
            o2 = n3 % 7, i2 = (n3 - o2) / 7;
            break;
          }
          case "month":
          case "year": {
            const i3 = this.compareCalendarDates(t2, e2);
            if (!i3) return { years: 0, months: 0, weeks: 0, days: 0 };
            const c2 = t2.year - e2.year, d2 = t2.day - e2.day;
            if ("year" === n2 && c2) {
              let n3 = 0;
              t2.monthCode > e2.monthCode && (n3 = 1), t2.monthCode < e2.monthCode && (n3 = -1), n3 || (n3 = Math.sign(d2)), s2 = n3 * i3 < 0 ? c2 - i3 : c2;
            }
            let h2, u2 = s2 ? this.addCalendar(e2, { years: s2 }, "constrain", r2) : e2;
            do {
              a2 += i3, h2 = u2, u2 = this.addMonthsCalendar(h2, i3, "constrain", r2), u2.day !== e2.day && (u2 = this.regulateDate({ ...u2, day: e2.day }, "constrain", r2));
            } while (this.compareCalendarDates(t2, u2) * i3 >= 0);
            a2 -= i3, o2 = this.calendarDaysUntil(h2, t2, r2);
            break;
          }
        }
        return { years: s2, months: a2, weeks: i2, days: o2 };
      }
      daysInMonth(e2, t2) {
        const { day: n2 } = e2, r2 = this.maximumMonthLength(e2), o2 = this.minimumMonthLength(e2);
        if (o2 === r2) return o2;
        const i2 = n2 <= r2 - o2 ? r2 : o2, a2 = this.calendarToIsoDate(e2, "constrain", t2), s2 = this.addDaysIso(a2, i2), c2 = this.isoToCalendarDate(s2, t2), d2 = this.addDaysIso(s2, -c2.day);
        return this.isoToCalendarDate(d2, t2).day;
      }
      daysInPreviousMonth(e2, t2) {
        const { day: n2, month: r2, year: o2 } = e2;
        let i2 = { year: r2 > 1 ? o2 : o2 - 1, month: r2, day: 1 };
        const a2 = r2 > 1 ? r2 - 1 : this.monthsInYear(i2, t2);
        i2 = { ...i2, month: a2 };
        const s2 = this.minimumMonthLength(i2), c2 = this.maximumMonthLength(i2);
        if (s2 === c2) return c2;
        const d2 = this.calendarToIsoDate(e2, "constrain", t2), h2 = this.addDaysIso(d2, -n2);
        return this.isoToCalendarDate(h2, t2).day;
      }
      startOfCalendarYear(e2) {
        return { year: e2.year, month: 1, monthCode: "M01", day: 1 };
      }
      startOfCalendarMonth(e2) {
        return { year: e2.year, month: e2.month, day: 1 };
      }
      calendarDaysUntil(e2, t2, n2) {
        const r2 = this.calendarToIsoDate(e2, "constrain", n2), o2 = this.calendarToIsoDate(t2, "constrain", n2);
        return Gr(o2.year, o2.month - 1, o2.day) - Gr(r2.year, r2.month - 1, r2.day);
      }
      monthDaySearchStartYear(e2, t2) {
        return 1972;
      }
      monthDayFromFields(e2, t2, n2) {
        let r2, o2, i2, a2, s2, { era: c2, eraYear: d2, year: h2, month: u2, monthCode: l2, day: m2 } = e2;
        if (void 0 !== u2 && void 0 === h2 && (!this.hasEra || void 0 === c2 || void 0 === d2)) throw new TypeError("when month is present, year (or era and eraYear) are required");
        (void 0 === l2 || void 0 !== h2 || this.hasEra && void 0 !== d2) && ({ monthCode: l2, day: m2 } = this.isoToCalendarDate(this.calendarToIsoDate(e2, t2, n2), n2));
        const f2 = { year: this.monthDaySearchStartYear(l2, m2), month: 12, day: 31 }, y2 = this.isoToCalendarDate(f2, n2), p2 = y2.monthCode > l2 || y2.monthCode === l2 && y2.day >= m2 ? y2.year : y2.year - 1;
        for (let e3 = 0; e3 < 20; e3++) {
          const c3 = this.adjustCalendarDate({ day: m2, monthCode: l2, year: p2 - e3 }, n2), d3 = this.calendarToIsoDate(c3, "constrain", n2), h3 = this.isoToCalendarDate(d3, n2);
          if ({ year: r2, month: o2, day: i2 } = d3, h3.monthCode === l2 && h3.day === m2) return { month: o2, day: i2, year: r2 };
          if ("constrain" === t2) {
            const e4 = this.maxLengthOfMonthCodeInAnyYear(h3.monthCode);
            if (h3.monthCode === l2 && h3.day === e4 && m2 > e4) return { month: o2, day: i2, year: r2 };
            (void 0 === a2 || h3.monthCode === a2.monthCode && h3.day > a2.day) && (a2 = h3, s2 = d3);
          }
        }
        if ("constrain" === t2 && void 0 !== s2) return s2;
        throw new RangeError(`No recent ${this.id} year with monthCode ${l2} and day ${m2}`);
      }
      getFirstDayOfWeek() {
      }
      getMinimalDaysInFirstWeek() {
      }
    };
    var HebrewHelper = class extends HelperBase {
      constructor() {
        super(...arguments), this.id = "hebrew", this.calendarType = "lunisolar", this.months = { Tishri: { leap: 1, regular: 1, monthCode: "M01", days: 30 }, Heshvan: { leap: 2, regular: 2, monthCode: "M02", days: { min: 29, max: 30 } }, Kislev: { leap: 3, regular: 3, monthCode: "M03", days: { min: 29, max: 30 } }, Tevet: { leap: 4, regular: 4, monthCode: "M04", days: 29 }, Shevat: { leap: 5, regular: 5, monthCode: "M05", days: 30 }, Adar: { leap: void 0, regular: 6, monthCode: "M06", days: 29 }, "Adar I": { leap: 6, regular: void 0, monthCode: "M05L", days: 30 }, "Adar II": { leap: 7, regular: void 0, monthCode: "M06", days: 29 }, Nisan: { leap: 8, regular: 7, monthCode: "M07", days: 30 }, Iyar: { leap: 9, regular: 8, monthCode: "M08", days: 29 }, Sivan: { leap: 10, regular: 9, monthCode: "M09", days: 30 }, Tamuz: { leap: 11, regular: 10, monthCode: "M10", days: 29 }, Av: { leap: 12, regular: 11, monthCode: "M11", days: 30 }, Elul: { leap: 13, regular: 12, monthCode: "M12", days: 29 } };
      }
      inLeapYear(e2) {
        const { year: t2 } = e2;
        return (7 * t2 + 1) % 19 < 7;
      }
      monthsInYear(e2) {
        return this.inLeapYear(e2) ? 13 : 12;
      }
      minimumMonthLength(e2) {
        return this.minMaxMonthLength(e2, "min");
      }
      maximumMonthLength(e2) {
        return this.minMaxMonthLength(e2, "max");
      }
      minMaxMonthLength(e2, t2) {
        const { month: n2, year: r2 } = e2, o2 = this.getMonthCode(r2, n2), i2 = Object.entries(this.months).find(((e3) => e3[1].monthCode === o2));
        if (void 0 === i2) throw new RangeError(`unmatched Hebrew month: ${n2}`);
        const a2 = i2[1].days;
        return "number" == typeof a2 ? a2 : a2[t2];
      }
      maxLengthOfMonthCodeInAnyYear(e2) {
        return ["M04", "M06", "M08", "M10", "M12"].includes(e2) ? 29 : 30;
      }
      estimateIsoDate(e2) {
        const { year: t2 } = e2;
        return { year: t2 - 3760, month: 1, day: 1 };
      }
      getMonthCode(e2, t2) {
        return this.inLeapYear({ year: e2 }) ? 6 === t2 ? ei(5, true) : ei(t2 < 6 ? t2 : t2 - 1) : ei(t2);
      }
      adjustCalendarDate(e2, t2, n2 = "constrain", r2 = false) {
        let { year: o2, month: i2, monthCode: a2, day: s2, monthExtra: c2 } = e2;
        if (void 0 === o2) throw new TypeError("Missing property: year");
        if (r2) {
          if (c2) {
            const e3 = this.months[c2];
            if (!e3) throw new RangeError(`Unrecognized month from formatToParts: ${c2}`);
            i2 = this.inLeapYear({ year: o2 }) ? e3.leap : e3.regular;
          }
          return a2 = this.getMonthCode(o2, i2), { year: o2, month: i2, day: s2, monthCode: a2 };
        }
        if (this.validateCalendarDate(e2), void 0 === i2) if (a2.endsWith("L")) {
          if ("M05L" !== a2) throw new RangeError(`Hebrew leap month must have monthCode M05L, not ${a2}`);
          if (i2 = 6, !this.inLeapYear({ year: o2 })) {
            if ("reject" === n2) throw new RangeError(`Hebrew monthCode M05L is invalid in year ${o2} which is not a leap year`);
            i2 = 6, a2 = "M06";
          }
        } else {
          i2 = Qo(a2), this.inLeapYear({ year: o2 }) && i2 >= 6 && i2++;
          const e3 = this.monthsInYear({ year: o2 });
          if (i2 < 1 || i2 > e3) throw new RangeError(`Invalid monthCode: ${a2}`);
        }
        else if ("reject" === n2 ? (Nr(i2, 1, this.monthsInYear({ year: o2 })), Nr(s2, 1, this.maximumMonthLength({ year: o2, month: i2 }))) : (i2 = jr(i2, 1, this.monthsInYear({ year: o2 })), s2 = jr(s2, 1, this.maximumMonthLength({ year: o2, month: i2 }))), void 0 === a2) a2 = this.getMonthCode(o2, i2);
        else if (this.getMonthCode(o2, i2) !== a2) throw new RangeError(`monthCode ${a2} doesn't correspond to month ${i2} in Hebrew year ${o2}`);
        return { ...e2, day: s2, month: i2, monthCode: a2, year: o2 };
      }
    };
    var IslamicBaseHelper = class extends HelperBase {
      constructor() {
        super(...arguments), this.calendarType = "lunar", this.DAYS_PER_ISLAMIC_YEAR = 354 + 11 / 30, this.DAYS_PER_ISO_YEAR = 365.2425;
      }
      inLeapYear(e2, t2) {
        const n2 = { year: e2.year, month: 1, monthCode: "M01", day: 1 }, r2 = { year: e2.year + 1, month: 1, monthCode: "M01", day: 1 };
        return 355 === this.calendarDaysUntil(n2, r2, t2);
      }
      monthsInYear() {
        return 12;
      }
      minimumMonthLength() {
        return 29;
      }
      maximumMonthLength() {
        return 30;
      }
      maxLengthOfMonthCodeInAnyYear() {
        return 30;
      }
      estimateIsoDate(e2) {
        const { year: t2 } = this.adjustCalendarDate(e2);
        return { year: Math.floor(t2 * this.DAYS_PER_ISLAMIC_YEAR / this.DAYS_PER_ISO_YEAR) + 622, month: 1, day: 1 };
      }
    };
    var IslamicHelper = class extends IslamicBaseHelper {
      constructor() {
        super(...arguments), this.id = "islamic";
      }
    };
    var IslamicUmalquraHelper = class extends IslamicBaseHelper {
      constructor() {
        super(...arguments), this.id = "islamic-umalqura";
      }
    };
    var IslamicTblaHelper = class extends IslamicBaseHelper {
      constructor() {
        super(...arguments), this.id = "islamic-tbla";
      }
    };
    var IslamicCivilHelper = class extends IslamicBaseHelper {
      constructor() {
        super(...arguments), this.id = "islamic-civil";
      }
    };
    var IslamicRgsaHelper = class extends IslamicBaseHelper {
      constructor() {
        super(...arguments), this.id = "islamic-rgsa";
      }
    };
    var IslamicCcHelper = class extends IslamicBaseHelper {
      constructor() {
        super(...arguments), this.id = "islamicc";
      }
    };
    var PersianHelper = class extends HelperBase {
      constructor() {
        super(...arguments), this.id = "persian", this.calendarType = "solar";
      }
      inLeapYear(e2, t2) {
        return 30 === this.daysInMonth({ year: e2.year, month: 12, day: 1 }, t2);
      }
      monthsInYear() {
        return 12;
      }
      minimumMonthLength(e2) {
        const { month: t2 } = e2;
        return 12 === t2 ? 29 : t2 <= 6 ? 31 : 30;
      }
      maximumMonthLength(e2) {
        const { month: t2 } = e2;
        return 12 === t2 ? 30 : t2 <= 6 ? 31 : 30;
      }
      maxLengthOfMonthCodeInAnyYear(e2) {
        return Qo(e2) <= 6 ? 31 : 30;
      }
      estimateIsoDate(e2) {
        const { year: t2 } = this.adjustCalendarDate(e2);
        return { year: t2 + 621, month: 1, day: 1 };
      }
    };
    var IndianHelper = class extends HelperBase {
      constructor() {
        super(...arguments), this.id = "indian", this.calendarType = "solar", this.months = { 1: { length: 30, month: 3, day: 22, leap: { length: 31, month: 3, day: 21 } }, 2: { length: 31, month: 4, day: 21 }, 3: { length: 31, month: 5, day: 22 }, 4: { length: 31, month: 6, day: 22 }, 5: { length: 31, month: 7, day: 23 }, 6: { length: 31, month: 8, day: 23 }, 7: { length: 30, month: 9, day: 23 }, 8: { length: 30, month: 10, day: 23 }, 9: { length: 30, month: 11, day: 22 }, 10: { length: 30, month: 12, day: 22 }, 11: { length: 30, month: 1, nextYear: true, day: 21 }, 12: { length: 30, month: 2, nextYear: true, day: 20 } }, this.vulnerableToBceBug = "10/11/-79 Saka" !== (/* @__PURE__ */ new Date("0000-01-01T00:00Z")).toLocaleDateString("en-US-u-ca-indian", { timeZone: "UTC" });
      }
      inLeapYear(e2) {
        return oi(e2.year + 78);
      }
      monthsInYear() {
        return 12;
      }
      minimumMonthLength(e2) {
        return this.getMonthInfo(e2).length;
      }
      maximumMonthLength(e2) {
        return this.getMonthInfo(e2).length;
      }
      maxLengthOfMonthCodeInAnyYear(e2) {
        const t2 = Qo(e2);
        let n2 = this.months[t2];
        return n2 = n2.leap ?? n2, n2.length;
      }
      getMonthInfo(e2) {
        const { month: t2 } = e2;
        let n2 = this.months[t2];
        if (void 0 === n2) throw new RangeError(`Invalid month: ${t2}`);
        return this.inLeapYear(e2) && n2.leap && (n2 = n2.leap), n2;
      }
      estimateIsoDate(e2) {
        const t2 = this.adjustCalendarDate(e2), n2 = this.getMonthInfo(t2);
        return Or(t2.year + 78 + (n2.nextYear ? 1 : 0), n2.month, n2.day + t2.day - 1);
      }
      checkIcuBugs(e2) {
        if (this.vulnerableToBceBug && e2.year < 1) throw new RangeError(`calendar '${this.id}' is broken for ISO dates before 0001-01-01 (see https://bugs.chromium.org/p/v8/issues/detail?id=10529)`);
      }
    };
    function oi(e2) {
      return e2 % 4 == 0 && (e2 % 100 != 0 || e2 % 400 == 0);
    }
    var GregorianBaseHelperFixedEpoch = class extends HelperBase {
      constructor(e2, t2) {
        super(), this.calendarType = "solar", this.id = e2, this.isoEpoch = t2;
      }
      inLeapYear(e2) {
        const { year: t2 } = this.estimateIsoDate({ month: 1, day: 1, year: e2.year });
        return oi(t2);
      }
      monthsInYear() {
        return 12;
      }
      minimumMonthLength(e2) {
        const { month: t2 } = e2;
        return 2 === t2 ? this.inLeapYear(e2) ? 29 : 28 : [4, 6, 9, 11].indexOf(t2) >= 0 ? 30 : 31;
      }
      maximumMonthLength(e2) {
        return this.minimumMonthLength(e2);
      }
      maxLengthOfMonthCodeInAnyYear(e2) {
        return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Qo(e2) - 1];
      }
      estimateIsoDate(e2) {
        const t2 = this.adjustCalendarDate(e2);
        return St(t2.year + this.isoEpoch.year, t2.month + this.isoEpoch.month, t2.day + this.isoEpoch.day, "constrain");
      }
    };
    var GregorianBaseHelper = class extends HelperBase {
      constructor(e2, t2) {
        super(), this.hasEra = true, this.calendarType = "solar", this.id = e2;
        const { eras: n2, anchorEra: r2 } = (function(e3) {
          let t3, n3 = e3;
          if (0 === n3.length) throw new RangeError("Invalid era data: eras are required");
          if (1 === n3.length && n3[0].reverseOf) throw new RangeError("Invalid era data: anchor era cannot count years backwards");
          if (1 === n3.length && !n3[0].code) throw new RangeError("Invalid era data: at least one named era is required");
          if (n3.filter(((e4) => null != e4.reverseOf)).length > 1) throw new RangeError("Invalid era data: only one era can count years backwards");
          n3.forEach(((e4) => {
            if (e4.isAnchor || !e4.anchorEpoch && !e4.reverseOf) {
              if (t3) throw new RangeError("Invalid era data: cannot have multiple anchor eras");
              t3 = e4, e4.anchorEpoch = { year: e4.hasYearZero ? 0 : 1 };
            } else if (!e4.code) throw new RangeError("If era name is blank, it must be the anchor era");
          })), n3 = n3.filter(((e4) => e4.code)), n3.forEach(((e4) => {
            const { reverseOf: t4 } = e4;
            if (t4) {
              const r4 = n3.find(((e5) => e5.code === t4));
              if (void 0 === r4) throw new RangeError(`Invalid era data: unmatched reverseOf era: ${t4}`);
              e4.reverseOf = r4, e4.anchorEpoch = r4.anchorEpoch, e4.isoEpoch = r4.isoEpoch;
            }
            void 0 === e4.anchorEpoch.month && (e4.anchorEpoch.month = 1), void 0 === e4.anchorEpoch.day && (e4.anchorEpoch.day = 1);
          })), n3.sort(((e4, t4) => {
            if (e4.reverseOf) return 1;
            if (t4.reverseOf) return -1;
            if (!e4.isoEpoch || !t4.isoEpoch) throw new RangeError("Invalid era data: missing ISO epoch");
            return t4.isoEpoch.year - e4.isoEpoch.year;
          }));
          const r3 = n3[n3.length - 1].reverseOf;
          if (r3 && r3 !== n3[n3.length - 2]) throw new RangeError("Invalid era data: invalid reverse-sign era");
          return n3.forEach(((e4, t4) => {
            e4.genericName = "era" + (n3.length - 1 - t4);
          })), { eras: n3, anchorEra: t3 || n3[0] };
        })(t2);
        this.anchorEra = r2, this.eras = n2;
      }
      inLeapYear(e2) {
        const { year: t2 } = this.estimateIsoDate({ month: 1, day: 1, year: e2.year });
        return oi(t2);
      }
      monthsInYear() {
        return 12;
      }
      minimumMonthLength(e2) {
        const { month: t2 } = e2;
        return 2 === t2 ? this.inLeapYear(e2) ? 29 : 28 : [4, 6, 9, 11].indexOf(t2) >= 0 ? 30 : 31;
      }
      maximumMonthLength(e2) {
        return this.minimumMonthLength(e2);
      }
      maxLengthOfMonthCodeInAnyYear(e2) {
        return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Qo(e2) - 1];
      }
      completeEraYear(e2) {
        const t2 = (t3, n3, r3) => {
          const o3 = e2[t3];
          if (null != o3 && o3 != n3 && !(r3 || []).includes(o3)) {
            const e3 = r3?.[0];
            throw new RangeError(`Input ${t3} ${o3} doesn't match calculated value ${e3 ? `${n3} (also called ${e3})` : n3}`);
          }
        }, n2 = (t3) => {
          let n3;
          const r3 = { ...e2, year: t3 }, o3 = this.eras.find(((e3, o4) => {
            if (o4 === this.eras.length - 1) {
              if (e3.reverseOf) {
                if (t3 > 0) throw new RangeError(`Signed year ${t3} is invalid for era ${e3.code}`);
                return n3 = e3.anchorEpoch.year - t3, true;
              }
              return n3 = t3 - e3.anchorEpoch.year + (e3.hasYearZero ? 0 : 1), true;
            }
            return this.compareCalendarDates(r3, e3.anchorEpoch) >= 0 && (n3 = t3 - e3.anchorEpoch.year + (e3.hasYearZero ? 0 : 1), true);
          }));
          if (!o3) throw new RangeError(`Year ${t3} was not matched by any era`);
          return { eraYear: n3, era: o3.code, eraNames: o3.names };
        };
        let { year: r2, eraYear: o2, era: i2 } = e2;
        if (null != r2) {
          const e3 = n2(r2);
          ({ eraYear: o2, era: i2 } = e3), t2("era", i2, e3?.eraNames), t2("eraYear", o2);
        } else {
          if (null == o2) throw new RangeError("Either year or eraYear and era are required");
          {
            if (void 0 === i2) throw new RangeError("era and eraYear must be provided together");
            const e3 = this.eras.find((({ code: e4, names: t3 = [] }) => e4 === i2 || t3.includes(i2)));
            if (!e3) throw new RangeError(`Era ${i2} (ISO year ${o2}) was not matched by any era`);
            r2 = e3.reverseOf ? e3.anchorEpoch.year - o2 : o2 + e3.anchorEpoch.year - (e3.hasYearZero ? 0 : 1), t2("year", r2), { eraYear: o2, era: i2 } = n2(r2);
          }
        }
        return { ...e2, year: r2, eraYear: o2, era: i2 };
      }
      adjustCalendarDate(e2, t2, n2 = "constrain") {
        let r2 = e2;
        const { month: o2, monthCode: i2 } = r2;
        return void 0 === o2 && (r2 = { ...r2, month: Qo(i2) }), this.validateCalendarDate(r2), r2 = this.completeEraYear(r2), super.adjustCalendarDate(r2, t2, n2);
      }
      estimateIsoDate(e2) {
        const t2 = this.adjustCalendarDate(e2), { year: n2, month: r2, day: o2 } = t2, { anchorEra: i2 } = this;
        return St(n2 + i2.isoEpoch.year - (i2.hasYearZero ? 0 : 1), r2, o2, "constrain");
      }
    };
    var SameMonthDayAsGregorianBaseHelper = class extends GregorianBaseHelper {
      constructor(e2, t2) {
        super(e2, t2);
      }
      isoToCalendarDate(e2) {
        const { year: t2, month: n2, day: r2 } = e2, o2 = ei(n2), i2 = t2 - this.anchorEra.isoEpoch.year + 1;
        return this.completeEraYear({ year: i2, month: n2, monthCode: o2, day: r2 });
      }
    };
    var ii = { inLeapYear(e2) {
      const { year: t2 } = e2;
      return (t2 + 1) % 4 == 0;
    }, monthsInYear: () => 13, minimumMonthLength(e2) {
      const { month: t2 } = e2;
      return 13 === t2 ? this.inLeapYear(e2) ? 6 : 5 : 30;
    }, maximumMonthLength(e2) {
      return this.minimumMonthLength(e2);
    }, maxLengthOfMonthCodeInAnyYear: (e2) => "M13" === e2 ? 6 : 30 };
    var OrthodoxBaseHelperFixedEpoch = class extends GregorianBaseHelperFixedEpoch {
      constructor(e2, t2) {
        super(e2, t2), this.inLeapYear = ii.inLeapYear, this.monthsInYear = ii.monthsInYear, this.minimumMonthLength = ii.minimumMonthLength, this.maximumMonthLength = ii.maximumMonthLength, this.maxLengthOfMonthCodeInAnyYear = ii.maxLengthOfMonthCodeInAnyYear;
      }
    };
    var OrthodoxBaseHelper = class extends GregorianBaseHelper {
      constructor(e2, t2) {
        super(e2, t2), this.inLeapYear = ii.inLeapYear, this.monthsInYear = ii.monthsInYear, this.minimumMonthLength = ii.minimumMonthLength, this.maximumMonthLength = ii.maximumMonthLength, this.maxLengthOfMonthCodeInAnyYear = ii.maxLengthOfMonthCodeInAnyYear;
      }
    };
    var EthioaaHelper = class extends OrthodoxBaseHelperFixedEpoch {
      constructor() {
        super("ethioaa", { year: -5492, month: 7, day: 17 });
      }
    };
    var CopticHelper = class extends OrthodoxBaseHelper {
      constructor() {
        super("coptic", [{ code: "coptic", isoEpoch: { year: 284, month: 8, day: 29 } }, { code: "coptic-inverse", reverseOf: "coptic" }]);
      }
    };
    var EthiopicHelper = class extends OrthodoxBaseHelper {
      constructor() {
        super("ethiopic", [{ code: "ethioaa", names: ["ethiopic-amete-alem", "mundi"], isoEpoch: { year: -5492, month: 7, day: 17 } }, { code: "ethiopic", names: ["incar"], isoEpoch: { year: 8, month: 8, day: 27 }, anchorEpoch: { year: 5501 } }]);
      }
    };
    var RocHelper = class extends SameMonthDayAsGregorianBaseHelper {
      constructor() {
        super("roc", [{ code: "roc", names: ["minguo"], isoEpoch: { year: 1912, month: 1, day: 1 } }, { code: "roc-inverse", names: ["before-roc"], reverseOf: "roc" }]);
      }
    };
    var BuddhistHelper = class extends GregorianBaseHelperFixedEpoch {
      constructor() {
        super("buddhist", { year: -543, month: 1, day: 1 });
      }
    };
    var GregoryHelper = class extends SameMonthDayAsGregorianBaseHelper {
      constructor() {
        super("gregory", [{ code: "gregory", names: ["ad", "ce"], isoEpoch: { year: 1, month: 1, day: 1 } }, { code: "gregory-inverse", names: ["be", "bce"], reverseOf: "gregory" }]);
      }
      reviseIntlEra(e2) {
        let { era: t2, eraYear: n2 } = e2;
        return "b" === t2 && (t2 = "gregory-inverse"), "a" === t2 && (t2 = "gregory"), { era: t2, eraYear: n2 };
      }
      getFirstDayOfWeek() {
        return 1;
      }
      getMinimalDaysInFirstWeek() {
        return 1;
      }
    };
    var JapaneseHelper = class extends SameMonthDayAsGregorianBaseHelper {
      constructor() {
        super("japanese", [{ code: "reiwa", isoEpoch: { year: 2019, month: 5, day: 1 }, anchorEpoch: { year: 2019, month: 5, day: 1 } }, { code: "heisei", isoEpoch: { year: 1989, month: 1, day: 8 }, anchorEpoch: { year: 1989, month: 1, day: 8 } }, { code: "showa", isoEpoch: { year: 1926, month: 12, day: 25 }, anchorEpoch: { year: 1926, month: 12, day: 25 } }, { code: "taisho", isoEpoch: { year: 1912, month: 7, day: 30 }, anchorEpoch: { year: 1912, month: 7, day: 30 } }, { code: "meiji", isoEpoch: { year: 1868, month: 9, day: 8 }, anchorEpoch: { year: 1868, month: 9, day: 8 } }, { code: "japanese", names: ["japanese", "gregory", "ad", "ce"], isoEpoch: { year: 1, month: 1, day: 1 } }, { code: "japanese-inverse", names: ["japanese-inverse", "gregory-inverse", "bc", "bce"], reverseOf: "japanese" }]), this.erasBeginMidYear = true;
      }
      reviseIntlEra(e2, t2) {
        const { era: n2, eraYear: r2 } = e2, { year: o2 } = t2;
        return this.eras.find(((e3) => e3.code === n2)) ? { era: n2, eraYear: r2 } : o2 < 1 ? { era: "japanese-inverse", eraYear: 1 - o2 } : { era: "japanese", eraYear: o2 };
      }
    };
    var ChineseBaseHelper = class extends HelperBase {
      constructor() {
        super(...arguments), this.calendarType = "lunisolar";
      }
      inLeapYear(e2, t2) {
        const n2 = this.getMonthList(e2.year, t2);
        return 13 === Object.entries(n2).length;
      }
      monthsInYear(e2, t2) {
        return this.inLeapYear(e2, t2) ? 13 : 12;
      }
      minimumMonthLength() {
        return 29;
      }
      maximumMonthLength() {
        return 30;
      }
      maxLengthOfMonthCodeInAnyYear(e2) {
        return ["M01L", "M09L", "M10L", "M11L", "M12L"].includes(e2) ? 29 : 30;
      }
      monthDaySearchStartYear(e2, t2) {
        const n2 = { M01L: [1651, 1651], M02L: [1947, 1765], M03L: [1966, 1955], M04L: [1963, 1944], M05L: [1971, 1952], M06L: [1960, 1941], M07L: [1968, 1938], M08L: [1957, 1718], M09L: [1832, 1832], M10L: [1870, 1870], M11L: [1814, 1814], M12L: [1890, 1890] }[e2] ?? [1972, 1972];
        return t2 < 30 ? n2[0] : n2[1];
      }
      getMonthList(e2, t2) {
        if (void 0 === e2) throw new TypeError("Missing year");
        const n2 = JSON.stringify({ func: "getMonthList", calendarYear: e2, id: this.id }), r2 = t2.get(n2);
        if (r2) return r2;
        const o2 = this.getFormatter(), i2 = (e3, t3) => {
          const n3 = ni({ isoYear: e3, isoMonth: 2, isoDay: 1 }), r3 = new Date(n3);
          r3.setUTCDate(t3 + 1);
          const i3 = o2.formatToParts(r3), a3 = i3.find(((e4) => "month" === e4.type)).value, s3 = +i3.find(((e4) => "day" === e4.type)).value, c3 = i3.find(((e4) => "relatedYear" === e4.type));
          let d3;
          if (void 0 === c3) throw new RangeError(`Intl.DateTimeFormat.formatToParts lacks relatedYear in ${this.id} calendar. Try Node 14+ or modern browsers.`);
          return d3 = +c3.value, { calendarMonthString: a3, calendarDay: s3, calendarYearToVerify: d3 };
        };
        let a2 = 17, { calendarMonthString: s2, calendarDay: c2, calendarYearToVerify: d2 } = i2(e2, a2);
        "1" !== s2 && (a2 += 29, { calendarMonthString: s2, calendarDay: c2 } = i2(e2, a2)), a2 -= c2 - 5;
        const h2 = {};
        let u2, l2, m2 = 1, f2 = false;
        do {
          ({ calendarMonthString: s2, calendarDay: c2, calendarYearToVerify: d2 } = i2(e2, a2)), u2 && (h2[l2].daysInMonth = u2 + 30 - c2), d2 !== e2 ? f2 = true : (h2[s2] = { monthIndex: m2++ }, a2 += 30), u2 = c2, l2 = s2;
        } while (!f2);
        return h2[l2].daysInMonth = u2 + 30 - c2, t2.set(n2, h2), h2;
      }
      estimateIsoDate(e2) {
        const { year: t2, month: n2 } = e2;
        return { year: t2, month: n2 >= 12 ? 12 : n2 + 1, day: 1 };
      }
      adjustCalendarDate(e2, t2, n2 = "constrain", r2 = false) {
        let { year: o2, month: i2, monthExtra: a2, day: s2, monthCode: c2 } = e2;
        if (void 0 === o2) throw new TypeError("Missing property: year");
        if (r2) {
          if (a2 && "bis" !== a2) throw new RangeError(`Unexpected leap month suffix: ${a2}`);
          const e3 = ei(i2, void 0 !== a2), n3 = `${i2}${a2 || ""}`, r3 = this.getMonthList(o2, t2)[n3];
          if (void 0 === r3) throw new RangeError(`Unmatched month ${n3} in Chinese year ${o2}`);
          return i2 = r3.monthIndex, { year: o2, month: i2, day: s2, monthCode: e3 };
        }
        if (this.validateCalendarDate(e2), void 0 === i2) {
          const e3 = this.getMonthList(o2, t2);
          let r3 = c2.replace(/^M|L$/g, ((e4) => "L" === e4 ? "bis" : ""));
          "0" === r3[0] && (r3 = r3.slice(1));
          let a3 = e3[r3];
          if (i2 = a3 && a3.monthIndex, void 0 === i2 && c2.endsWith("L") && "M13L" != c2 && "constrain" === n2) {
            const t3 = +c2.replace(/^M0?|L$/g, "");
            a3 = e3[t3], a3 && (i2 = a3.monthIndex, c2 = ei(t3));
          }
          if (void 0 === i2) throw new RangeError(`Unmatched month ${c2} in Chinese year ${o2}`);
        } else if (void 0 === c2) {
          const e3 = this.getMonthList(o2, t2), r3 = Object.entries(e3), a3 = r3.length;
          "reject" === n2 ? (Nr(i2, 1, a3), Nr(s2, 1, this.maximumMonthLength())) : (i2 = jr(i2, 1, a3), s2 = jr(s2, 1, this.maximumMonthLength()));
          const d2 = r3.find(((e4) => e4[1].monthIndex === i2));
          if (void 0 === d2) throw new RangeError(`Invalid month ${i2} in Chinese year ${o2}`);
          c2 = ei(+d2[0].replace("bis", ""), -1 !== d2[0].indexOf("bis"));
        } else {
          const e3 = this.getMonthList(o2, t2);
          let n3 = c2.replace(/^M|L$/g, ((e4) => "L" === e4 ? "bis" : ""));
          "0" === n3[0] && (n3 = n3.slice(1));
          const r3 = e3[n3];
          if (!r3) throw new RangeError(`Unmatched monthCode ${c2} in Chinese year ${o2}`);
          if (i2 !== r3.monthIndex) throw new RangeError(`monthCode ${c2} doesn't correspond to month ${i2} in Chinese year ${o2}`);
        }
        return { ...e2, year: o2, month: i2, monthCode: c2, day: s2 };
      }
    };
    var ChineseHelper = class extends ChineseBaseHelper {
      constructor() {
        super(...arguments), this.id = "chinese";
      }
    };
    var DangiHelper = class extends ChineseBaseHelper {
      constructor() {
        super(...arguments), this.id = "dangi";
      }
    };
    var NonIsoCalendar = class {
      constructor(e2) {
        this.helper = e2;
      }
      extraFields(e2) {
        return this.helper.hasEra && e2.includes("year") ? ["era", "eraYear"] : [];
      }
      resolveFields(e2) {
        if ("lunisolar" !== this.helper.calendarType) {
          const t2 = new OneObjectCache();
          ti(e2, void 0, this.helper.monthsInYear({ year: e2.year ?? 1972 }, t2));
        }
      }
      dateToISO(e2, t2) {
        const n2 = new OneObjectCache(), r2 = this.helper.calendarToIsoDate(e2, t2, n2);
        return n2.setObject(r2), r2;
      }
      monthDayToISOReferenceDate(e2, t2) {
        const n2 = new OneObjectCache(), r2 = this.helper.monthDayFromFields(e2, t2, n2);
        return n2.setObject(r2), r2;
      }
      fieldKeysToIgnore(e2) {
        const t2 = /* @__PURE__ */ new Set();
        for (let n2 = 0; n2 < e2.length; n2++) {
          const r2 = e2[n2];
          switch (t2.add(r2), r2) {
            case "era":
              t2.add("eraYear"), t2.add("year");
              break;
            case "eraYear":
              t2.add("era"), t2.add("year");
              break;
            case "year":
              t2.add("era"), t2.add("eraYear");
              break;
            case "month":
              t2.add("monthCode"), this.helper.erasBeginMidYear && (t2.add("era"), t2.add("eraYear"));
              break;
            case "monthCode":
              t2.add("month"), this.helper.erasBeginMidYear && (t2.add("era"), t2.add("eraYear"));
              break;
            case "day":
              this.helper.erasBeginMidYear && (t2.add("era"), t2.add("eraYear"));
          }
        }
        return Go(t2);
      }
      dateAdd(e2, { years: t2, months: n2, weeks: r2, days: o2 }, i2) {
        const a2 = OneObjectCache.getCacheForObject(e2), s2 = this.helper.isoToCalendarDate(e2, a2), c2 = this.helper.addCalendar(s2, { years: t2, months: n2, weeks: r2, days: o2 }, i2, a2), d2 = this.helper.calendarToIsoDate(c2, "constrain", a2);
        return OneObjectCache.getCacheForObject(d2) || new OneObjectCache(a2).setObject(d2), d2;
      }
      dateUntil(e2, t2, n2) {
        const r2 = OneObjectCache.getCacheForObject(e2), o2 = OneObjectCache.getCacheForObject(t2), i2 = this.helper.isoToCalendarDate(e2, r2), a2 = this.helper.isoToCalendarDate(t2, o2);
        return this.helper.untilCalendar(i2, a2, n2, r2);
      }
      isoToDate(e2, t2) {
        const n2 = OneObjectCache.getCacheForObject(e2), r2 = this.helper.isoToCalendarDate(e2, n2);
        if (t2.dayOfWeek && (r2.dayOfWeek = Xo.iso8601.isoToDate(e2, { dayOfWeek: true }).dayOfWeek), t2.dayOfYear) {
          const e3 = this.helper.startOfCalendarYear(r2), t3 = this.helper.calendarDaysUntil(e3, r2, n2);
          r2.dayOfYear = t3 + 1;
        }
        if (t2.weekOfYear && (r2.weekOfYear = Ko(this.helper.id, e2)), r2.daysInWeek = 7, t2.daysInMonth && (r2.daysInMonth = this.helper.daysInMonth(r2, n2)), t2.daysInYear) {
          const e3 = this.helper.startOfCalendarYear(r2), t3 = this.helper.addCalendar(e3, { years: 1 }, "constrain", n2);
          r2.daysInYear = this.helper.calendarDaysUntil(e3, t3, n2);
        }
        return t2.monthsInYear && (r2.monthsInYear = this.helper.monthsInYear(r2, n2)), t2.inLeapYear && (r2.inLeapYear = this.helper.inLeapYear(r2, n2)), r2;
      }
      getFirstDayOfWeek() {
        return this.helper.getFirstDayOfWeek();
      }
      getMinimalDaysInFirstWeek() {
        return this.helper.getMinimalDaysInFirstWeek();
      }
    };
    for (const e2 of [HebrewHelper, PersianHelper, EthiopicHelper, EthioaaHelper, CopticHelper, ChineseHelper, DangiHelper, RocHelper, IndianHelper, BuddhistHelper, GregoryHelper, JapaneseHelper, IslamicHelper, IslamicUmalquraHelper, IslamicTblaHelper, IslamicCivilHelper, IslamicRgsaHelper, IslamicCcHelper]) {
      const t2 = new e2();
      Xo[t2.id] = new NonIsoCalendar(t2);
    }
    se("calendarImpl", (function(e2) {
      return Xo[e2];
    }));
    var ai = Intl.DateTimeFormat;
    function si(e2, t2) {
      let n2 = re(e2, t2);
      return "function" == typeof n2 && (n2 = new ai(re(e2, G), n2(re(e2, K))), (function(e3, t3, n3) {
        const r2 = Q(e3);
        if (void 0 === r2) throw new TypeError("Missing slots for the given container");
        if (void 0 === r2[t3]) throw new TypeError(`tried to reset ${t3} which was not set`);
        r2[t3] = n3;
      })(e2, t2, n2)), n2;
    }
    function ci(e2) {
      return ne(e2, q);
    }
    var DateTimeFormatImpl = class {
      constructor(e2 = void 0, t2 = void 0) {
        !(function(e3, t3, n2) {
          const r2 = void 0 !== n2;
          let o2;
          if (r2) {
            const e4 = ["localeMatcher", "calendar", "numberingSystem", "hour12", "hourCycle", "timeZone", "weekday", "era", "year", "month", "day", "dayPeriod", "hour", "minute", "second", "fractionalSecondDigits", "timeZoneName", "formatMatcher", "dateStyle", "timeStyle"];
            o2 = (function(e5) {
              if (null == e5) throw new TypeError(`Expected object not ${e5}`);
              return Object(e5);
            })(n2);
            const t4 = /* @__PURE__ */ Object.create(null);
            for (let n3 = 0; n3 < e4.length; n3++) {
              const r3 = e4[n3];
              Object.prototype.hasOwnProperty.call(o2, r3) && (t4[r3] = o2[r3]);
            }
            o2 = t4;
          } else o2 = /* @__PURE__ */ Object.create(null);
          const i2 = new ai(t3, o2), a2 = i2.resolvedOptions();
          if (te(e3), r2) {
            const t4 = Object.assign(/* @__PURE__ */ Object.create(null), a2);
            for (const e4 in t4) Object.prototype.hasOwnProperty.call(o2, e4) || delete t4[e4];
            t4.hour12 = o2.hour12, t4.hourCycle = o2.hourCycle, oe(e3, K, t4);
          } else oe(e3, K, o2);
          oe(e3, G, a2.locale), oe(e3, q, i2), oe(e3, W, a2.timeZone), oe(e3, J, a2.calendar), oe(e3, B, vi), oe(e3, Z, gi), oe(e3, F, wi), oe(e3, H, pi), oe(e3, z, bi), oe(e3, A, Di);
          const s2 = r2 ? o2.timeZone : void 0;
          if (void 0 === s2) oe(e3, _, a2.timeZone);
          else {
            const t4 = We(s2);
            if (t4.startsWith("\u2212")) throw new RangeError("Unicode minus (U+2212) is not supported in time zone offsets");
            oe(e3, _, Bn(t4));
          }
        })(this, e2, t2);
      }
      get format() {
        vt(this, ci);
        const e2 = ui.bind(this);
        return Object.defineProperties(e2, { length: { value: 1, enumerable: false, writable: false, configurable: true }, name: { value: "", enumerable: false, writable: false, configurable: true } }), e2;
      }
      formatRange(e2, t2) {
        return vt(this, ci), mi.call(this, e2, t2);
      }
      formatToParts(e2, ...t2) {
        return vt(this, ci), li.call(this, e2, ...t2);
      }
      formatRangeToParts(e2, t2) {
        return vt(this, ci), fi.call(this, e2, t2);
      }
      resolvedOptions() {
        return vt(this, ci), hi.call(this);
      }
    };
    "formatToParts" in ai.prototype || delete DateTimeFormatImpl.prototype.formatToParts, "formatRangeToParts" in ai.prototype || delete DateTimeFormatImpl.prototype.formatRangeToParts;
    var di = function(e2 = void 0, t2 = void 0) {
      return new DateTimeFormatImpl(e2, t2);
    };
    function hi() {
      const e2 = re(this, q).resolvedOptions();
      return e2.timeZone = re(this, _), e2;
    }
    function ui(e2, ...t2) {
      let n2, r2, o2 = $i(e2, this);
      return o2.formatter ? (n2 = o2.formatter, r2 = [No(o2.epochNs, "floor")]) : (n2 = re(this, q), r2 = [e2, ...t2]), n2.format(...r2);
    }
    function li(e2, ...t2) {
      let n2, r2, o2 = $i(e2, this);
      return o2.formatter ? (n2 = o2.formatter, r2 = [No(o2.epochNs, "floor")]) : (n2 = re(this, q), r2 = [e2, ...t2]), n2.formatToParts(...r2);
    }
    function mi(e2, t2) {
      if (void 0 === e2 || void 0 === t2) throw new TypeError("Intl.DateTimeFormat.formatRange requires two values");
      const n2 = Ci(e2), r2 = Ci(t2);
      let o2, i2 = [n2, r2];
      if (Ii(n2) !== Ii(r2)) throw new TypeError("Intl.DateTimeFormat.formatRange accepts two values of the same type");
      if (Ii(n2)) {
        if (!Oi(n2, r2)) throw new TypeError("Intl.DateTimeFormat.formatRange accepts two values of the same type");
        const { epochNs: e3, formatter: t3 } = $i(n2, this), { epochNs: a2, formatter: s2 } = $i(r2, this);
        t3 && (o2 = t3, i2 = [No(e3, "floor"), No(a2, "floor")]);
      }
      return o2 || (o2 = re(this, q)), o2.formatRange(...i2);
    }
    function fi(e2, t2) {
      if (void 0 === e2 || void 0 === t2) throw new TypeError("Intl.DateTimeFormat.formatRange requires two values");
      const n2 = Ci(e2), r2 = Ci(t2);
      let o2, i2 = [n2, r2];
      if (Ii(n2) !== Ii(r2)) throw new TypeError("Intl.DateTimeFormat.formatRangeToParts accepts two values of the same type");
      if (Ii(n2)) {
        if (!Oi(n2, r2)) throw new TypeError("Intl.DateTimeFormat.formatRangeToParts accepts two values of the same type");
        const { epochNs: e3, formatter: t3 } = $i(n2, this), { epochNs: a2, formatter: s2 } = $i(r2, this);
        t3 && (o2 = t3, i2 = [No(e3, "floor"), No(a2, "floor")]);
      }
      return o2 || (o2 = re(this, q)), o2.formatRangeToParts(...i2);
    }
    function yi(e2 = {}, t2 = {}) {
      const n2 = Object.assign({}, e2), r2 = ["year", "month", "day", "hour", "minute", "second", "weekday", "dayPeriod", "timeZoneName", "dateStyle", "timeStyle"];
      for (let e3 = 0; e3 < r2.length; e3++) {
        const o2 = r2[e3];
        n2[o2] = o2 in t2 ? t2[o2] : n2[o2], false !== n2[o2] && void 0 !== n2[o2] || delete n2[o2];
      }
      return n2;
    }
    function pi(e2) {
      const t2 = yi(e2, { year: false, month: false, day: false, weekday: false, timeZoneName: false, dateStyle: false });
      if ("long" !== t2.timeStyle && "full" !== t2.timeStyle || (delete t2.timeStyle, Object.assign(t2, { hour: "numeric", minute: "2-digit", second: "2-digit" })), !Mi(t2)) {
        if (Ei(e2)) throw new TypeError(`cannot format Temporal.PlainTime with options [${Object.keys(e2)}]`);
        Object.assign(t2, { hour: "numeric", minute: "numeric", second: "numeric" });
      }
      return t2;
    }
    function gi(e2) {
      const t2 = { short: { year: "2-digit", month: "numeric" }, medium: { year: "numeric", month: "short" }, long: { year: "numeric", month: "long" }, full: { year: "numeric", month: "long" } }, n2 = yi(e2, { day: false, hour: false, minute: false, second: false, weekday: false, dayPeriod: false, timeZoneName: false, timeStyle: false });
      if ("dateStyle" in n2 && n2.dateStyle) {
        const e3 = n2.dateStyle;
        delete n2.dateStyle, Object.assign(n2, t2[e3]);
      }
      if (!("year" in n2 || "month" in n2 || "era" in n2)) {
        if (Ei(e2)) throw new TypeError(`cannot format PlainYearMonth with options [${Object.keys(e2)}]`);
        Object.assign(n2, { year: "numeric", month: "numeric" });
      }
      return n2;
    }
    function wi(e2) {
      const t2 = { short: { month: "numeric", day: "numeric" }, medium: { month: "short", day: "numeric" }, long: { month: "long", day: "numeric" }, full: { month: "long", day: "numeric" } }, n2 = yi(e2, { year: false, hour: false, minute: false, second: false, weekday: false, dayPeriod: false, timeZoneName: false, timeStyle: false });
      if ("dateStyle" in n2 && n2.dateStyle) {
        const e3 = n2.dateStyle;
        delete n2.dateStyle, Object.assign(n2, t2[e3]);
      }
      if (!("month" in n2) && !("day" in n2)) {
        if (Ei(e2)) throw new TypeError(`cannot format PlainMonthDay with options [${Object.keys(e2)}]`);
        Object.assign(n2, { month: "numeric", day: "numeric" });
      }
      return n2;
    }
    function vi(e2) {
      const t2 = yi(e2, { hour: false, minute: false, second: false, dayPeriod: false, timeZoneName: false, timeStyle: false });
      if (!Ti(t2)) {
        if (Ei(e2)) throw new TypeError(`cannot format PlainDate with options [${Object.keys(e2)}]`);
        Object.assign(t2, { year: "numeric", month: "numeric", day: "numeric" });
      }
      return t2;
    }
    function bi(e2) {
      const t2 = yi(e2, { timeZoneName: false });
      if (("long" === t2.timeStyle || "full" === t2.timeStyle) && (delete t2.timeStyle, Object.assign(t2, { hour: "numeric", minute: "2-digit", second: "2-digit" }), t2.dateStyle)) {
        const e3 = { short: { year: "numeric", month: "numeric", day: "numeric" }, medium: { year: "numeric", month: "short", day: "numeric" }, long: { year: "numeric", month: "long", day: "numeric" }, full: { year: "numeric", month: "long", day: "numeric", weekday: "long" } };
        Object.assign(t2, e3[t2.dateStyle]), delete t2.dateStyle;
      }
      if (!Mi(t2) && !Ti(t2)) {
        if (Ei(e2)) throw new TypeError(`cannot format PlainDateTime with options [${Object.keys(e2)}]`);
        Object.assign(t2, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
      }
      return t2;
    }
    function Di(e2) {
      let t2 = e2;
      return Mi(t2) || Ti(t2) || (t2 = Object.assign({}, t2, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })), t2;
    }
    function Ti(e2) {
      return "year" in e2 || "month" in e2 || "day" in e2 || "weekday" in e2 || "dateStyle" in e2 || "era" in e2;
    }
    function Mi(e2) {
      return "hour" in e2 || "minute" in e2 || "second" in e2 || "timeStyle" in e2 || "dayPeriod" in e2 || "fractionalSecondDigits" in e2;
    }
    function Ei(e2) {
      return Ti(e2) || Mi(e2) || "dateStyle" in e2 || "timeStyle" in e2 || "timeZoneName" in e2;
    }
    function Ii(e2) {
      return mt(e2) || ft(e2) || yt(e2) || wt(e2) || pt(e2) || gt(e2) || ut(e2);
    }
    function Ci(e2) {
      return Ii(e2) ? e2 : qe(e2);
    }
    function Oi(e2, t2) {
      return !(!Ii(e2) || !Ii(t2) || ft(e2) && !ft(t2) || mt(e2) && !mt(t2) || yt(e2) && !yt(t2) || wt(e2) && !wt(t2) || pt(e2) && !pt(t2) || gt(e2) && !gt(t2) || ut(e2) && !ut(t2));
    }
    function $i(e2, t2) {
      if (ft(e2)) {
        const n2 = { isoDate: { year: 1970, month: 1, day: 1 }, time: re(e2, M) };
        return { epochNs: An(re(t2, W), n2, "compatible"), formatter: si(t2, H) };
      }
      if (pt(e2)) {
        const n2 = re(e2, E), r2 = re(t2, J);
        if (n2 !== r2) throw new RangeError(`cannot format PlainYearMonth with calendar ${n2} in locale with calendar ${r2}`);
        const o2 = xt(re(e2, D), { deltaDays: 0, hour: 12, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
        return { epochNs: An(re(t2, W), o2, "compatible"), formatter: si(t2, Z) };
      }
      if (gt(e2)) {
        const n2 = re(e2, E), r2 = re(t2, J);
        if (n2 !== r2) throw new RangeError(`cannot format PlainMonthDay with calendar ${n2} in locale with calendar ${r2}`);
        const o2 = xt(re(e2, D), { deltaDays: 0, hour: 12, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
        return { epochNs: An(re(t2, W), o2, "compatible"), formatter: si(t2, F) };
      }
      if (mt(e2)) {
        const n2 = re(e2, E), r2 = re(t2, J);
        if ("iso8601" !== n2 && n2 !== r2) throw new RangeError(`cannot format PlainDate with calendar ${n2} in locale with calendar ${r2}`);
        const o2 = xt(re(e2, D), { deltaDays: 0, hour: 12, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
        return { epochNs: An(re(t2, W), o2, "compatible"), formatter: si(t2, B) };
      }
      if (yt(e2)) {
        const n2 = re(e2, E), r2 = re(t2, J);
        if ("iso8601" !== n2 && n2 !== r2) throw new RangeError(`cannot format PlainDateTime with calendar ${n2} in locale with calendar ${r2}`);
        const o2 = re(e2, T);
        return { epochNs: An(re(t2, W), o2, "compatible"), formatter: si(t2, z) };
      }
      if (wt(e2)) throw new TypeError("Temporal.ZonedDateTime not supported in DateTimeFormat methods. Use toLocaleString() instead.");
      return ut(e2) ? { epochNs: re(e2, b), formatter: si(t2, A) } : {};
    }
    function Yi(e2) {
      const t2 = /* @__PURE__ */ Object.create(null);
      return t2.years = re(e2, Y), t2.months = re(e2, R), t2.weeks = re(e2, S), t2.days = re(e2, j), t2.hours = re(e2, k), t2.minutes = re(e2, N), t2.seconds = re(e2, x), t2.milliseconds = re(e2, L), t2.microseconds = re(e2, P), t2.nanoseconds = re(e2, U), t2;
    }
    DateTimeFormatImpl.prototype.constructor = di, Object.defineProperty(di, "prototype", { value: DateTimeFormatImpl.prototype, writable: false, enumerable: false, configurable: false }), di.supportedLocalesOf = ai.supportedLocalesOf, ae(di, "Intl.DateTimeFormat");
    var { format: Ri, formatToParts: Si } = Intl.DurationFormat?.prototype ?? /* @__PURE__ */ Object.create(null);
    function ji(e2) {
      Intl.DurationFormat.prototype.resolvedOptions.call(this);
      const t2 = Yi(sn(e2));
      return Ri.call(this, t2);
    }
    Intl.DurationFormat?.prototype && (Intl.DurationFormat.prototype.format = ji, Intl.DurationFormat.prototype.formatToParts = function(e2) {
      Intl.DurationFormat.prototype.resolvedOptions.call(this);
      const t2 = Yi(sn(e2));
      return Si.call(this, t2);
    });
    var ki = Object.freeze({ __proto__: null, DateTimeFormat: di, ModifiedIntlDurationFormatPrototypeFormat: ji });
    var Instant = class {
      constructor(e2) {
        if (arguments.length < 1) throw new TypeError("missing argument: epochNanoseconds is required");
        In(this, Lo(e2));
      }
      get epochMilliseconds() {
        return vt(this, ut), No(re(this, b), "floor");
      }
      get epochNanoseconds() {
        return vt(this, ut), ko(e.BigInt(re(this, b)));
      }
      add(e2) {
        return vt(this, ut), wo("add", this, e2);
      }
      subtract(e2) {
        return vt(this, ut), wo("subtract", this, e2);
      }
      until(e2, t2 = void 0) {
        return vt(this, ut), so("until", this, e2, t2);
      }
      since(e2, t2 = void 0) {
        return vt(this, ut), so("since", this, e2, t2);
      }
      round(e2) {
        if (vt(this, ut), void 0 === e2) throw new TypeError("options parameter is required");
        const t2 = "string" == typeof e2 ? Fo("smallestUnit", e2) : Zo(e2), n2 = Ft(t2), r2 = Ut(t2, "halfExpand"), o2 = Wt(t2, "smallestUnit", "time", qt);
        return Ht(n2, { hour: 24, minute: 1440, second: 86400, millisecond: 864e5, microsecond: 864e8, nanosecond: 864e11 }[o2], true), Cn(Io(re(this, b), n2, o2, r2));
      }
      equals(t2) {
        vt(this, ut);
        const n2 = cn(t2), r2 = re(this, b), o2 = re(n2, b);
        return e.equal(e.BigInt(r2), e.BigInt(o2));
      }
      toString(e2 = void 0) {
        vt(this, ut);
        const t2 = Zo(e2), n2 = zt(t2), r2 = Ut(t2, "trunc"), o2 = Wt(t2, "smallestUnit", "time", void 0);
        if ("hour" === o2) throw new RangeError('smallestUnit must be a time unit other than "hour"');
        let i2 = t2.timeZone;
        void 0 !== i2 && (i2 = Bn(i2));
        const { precision: a2, unit: s2, increment: c2 } = At(o2, n2);
        return Xn(Cn(Io(re(this, b), c2, s2, r2)), i2, a2);
      }
      toJSON() {
        return vt(this, ut), Xn(this, void 0, "auto");
      }
      toLocaleString(e2 = void 0, t2 = void 0) {
        return vt(this, ut), new di(e2, t2).format(this);
      }
      valueOf() {
        qo("Instant");
      }
      toZonedDateTimeISO(e2) {
        vt(this, ut);
        const t2 = Bn(e2);
        return $n(re(this, b), t2, "iso8601");
      }
      static fromEpochMilliseconds(e2) {
        return Cn(xo(qe(e2)));
      }
      static fromEpochNanoseconds(e2) {
        return Cn(Lo(e2));
      }
      static from(e2) {
        return cn(e2);
      }
      static compare(t2, n2) {
        const r2 = cn(t2), o2 = cn(n2), i2 = re(r2, b), a2 = re(o2, b);
        return e.lessThan(i2, a2) ? -1 : e.greaterThan(i2, a2) ? 1 : 0;
      }
    };
    ae(Instant, "Temporal.Instant");
    var PlainDate = class {
      constructor(e2, t2, n2, r2 = "iso8601") {
        const o2 = _e(e2), i2 = _e(t2), a2 = _e(n2), s2 = zo(void 0 === r2 ? "iso8601" : Ve(r2));
        xr(o2, i2, a2), yn(this, { year: o2, month: i2, day: a2 }, s2);
      }
      get calendarId() {
        return vt(this, mt), re(this, E);
      }
      get era() {
        return Ni(this, "era");
      }
      get eraYear() {
        return Ni(this, "eraYear");
      }
      get year() {
        return Ni(this, "year");
      }
      get month() {
        return Ni(this, "month");
      }
      get monthCode() {
        return Ni(this, "monthCode");
      }
      get day() {
        return Ni(this, "day");
      }
      get dayOfWeek() {
        return Ni(this, "dayOfWeek");
      }
      get dayOfYear() {
        return Ni(this, "dayOfYear");
      }
      get weekOfYear() {
        return Ni(this, "weekOfYear")?.week;
      }
      get yearOfWeek() {
        return Ni(this, "weekOfYear")?.year;
      }
      get daysInWeek() {
        return Ni(this, "daysInWeek");
      }
      get daysInMonth() {
        return Ni(this, "daysInMonth");
      }
      get daysInYear() {
        return Ni(this, "daysInYear");
      }
      get monthsInYear() {
        return Ni(this, "monthsInYear");
      }
      get inLeapYear() {
        return Ni(this, "inLeapYear");
      }
      with(e2, t2 = void 0) {
        if (vt(this, mt), !Ae(e2)) throw new TypeError("invalid argument");
        bt(e2);
        const n2 = re(this, E);
        let r2 = en(n2, re(this, D));
        return r2 = Rn(n2, r2, tn(n2, e2, ["year", "month", "monthCode", "day"], [], "partial")), pn(Ln(n2, r2, Lt(Zo(t2))), n2);
      }
      withCalendar(e2) {
        vt(this, mt);
        const t2 = kn(e2);
        return pn(re(this, D), t2);
      }
      add(e2, t2 = void 0) {
        return vt(this, mt), vo("add", this, e2, t2);
      }
      subtract(e2, t2 = void 0) {
        return vt(this, mt), vo("subtract", this, e2, t2);
      }
      until(e2, t2 = void 0) {
        return vt(this, mt), co("until", this, e2, t2);
      }
      since(e2, t2 = void 0) {
        return vt(this, mt), co("since", this, e2, t2);
      }
      equals(e2) {
        vt(this, mt);
        const t2 = rn(e2);
        return 0 === Ro(re(this, D), re(t2, D)) && xn(re(this, E), re(t2, E));
      }
      toString(e2 = void 0) {
        return vt(this, mt), er(this, Zt(Zo(e2)));
      }
      toJSON() {
        return vt(this, mt), er(this);
      }
      toLocaleString(e2 = void 0, t2 = void 0) {
        return vt(this, mt), new di(e2, t2).format(this);
      }
      valueOf() {
        qo("PlainDate");
      }
      toPlainDateTime(e2 = void 0) {
        vt(this, mt);
        const t2 = un(e2);
        return wn(xt(re(this, D), t2), re(this, E));
      }
      toZonedDateTime(e2) {
        let t2, n2;
        if (vt(this, mt), Ae(e2)) {
          const r3 = e2.timeZone;
          void 0 === r3 ? t2 = Bn(e2) : (t2 = Bn(r3), n2 = e2.plainTime);
        } else t2 = Bn(e2);
        const r2 = re(this, D);
        let o2;
        return void 0 === n2 ? o2 = _n(t2, r2) : (n2 = hn(n2), o2 = An(t2, xt(r2, re(n2, M)), "compatible")), $n(o2, t2, re(this, E));
      }
      toPlainYearMonth() {
        vt(this, mt);
        const e2 = re(this, E);
        return En(Pn(e2, en(e2, re(this, D)), "constrain"), e2);
      }
      toPlainMonthDay() {
        vt(this, mt);
        const e2 = re(this, E);
        return bn(Un(e2, en(e2, re(this, D)), "constrain"), e2);
      }
      static from(e2, t2 = void 0) {
        return rn(e2, t2);
      }
      static compare(e2, t2) {
        const n2 = rn(e2), r2 = rn(t2);
        return Ro(re(n2, D), re(r2, D));
      }
    };
    function Ni(e2, t2) {
      vt(e2, mt);
      const n2 = re(e2, D);
      return Qt(e2).isoToDate(n2, { [t2]: true })[t2];
    }
    ae(PlainDate, "Temporal.PlainDate");
    var PlainDateTime = class {
      constructor(e2, t2, n2, r2 = 0, o2 = 0, i2 = 0, a2 = 0, s2 = 0, c2 = 0, d2 = "iso8601") {
        const h2 = _e(e2), u2 = _e(t2), l2 = _e(n2), m2 = void 0 === r2 ? 0 : _e(r2), f2 = void 0 === o2 ? 0 : _e(o2), y2 = void 0 === i2 ? 0 : _e(i2), p2 = void 0 === a2 ? 0 : _e(a2), g2 = void 0 === s2 ? 0 : _e(s2), w2 = void 0 === c2 ? 0 : _e(c2), v2 = zo(void 0 === d2 ? "iso8601" : Ve(d2));
        Ur(h2, u2, l2, m2, f2, y2, p2, g2, w2), gn(this, { isoDate: { year: h2, month: u2, day: l2 }, time: { hour: m2, minute: f2, second: y2, millisecond: p2, microsecond: g2, nanosecond: w2 } }, v2);
      }
      get calendarId() {
        return vt(this, yt), re(this, E);
      }
      get year() {
        return xi(this, "year");
      }
      get month() {
        return xi(this, "month");
      }
      get monthCode() {
        return xi(this, "monthCode");
      }
      get day() {
        return xi(this, "day");
      }
      get hour() {
        return Li(this, "hour");
      }
      get minute() {
        return Li(this, "minute");
      }
      get second() {
        return Li(this, "second");
      }
      get millisecond() {
        return Li(this, "millisecond");
      }
      get microsecond() {
        return Li(this, "microsecond");
      }
      get nanosecond() {
        return Li(this, "nanosecond");
      }
      get era() {
        return xi(this, "era");
      }
      get eraYear() {
        return xi(this, "eraYear");
      }
      get dayOfWeek() {
        return xi(this, "dayOfWeek");
      }
      get dayOfYear() {
        return xi(this, "dayOfYear");
      }
      get weekOfYear() {
        return xi(this, "weekOfYear")?.week;
      }
      get yearOfWeek() {
        return xi(this, "weekOfYear")?.year;
      }
      get daysInWeek() {
        return xi(this, "daysInWeek");
      }
      get daysInYear() {
        return xi(this, "daysInYear");
      }
      get daysInMonth() {
        return xi(this, "daysInMonth");
      }
      get monthsInYear() {
        return xi(this, "monthsInYear");
      }
      get inLeapYear() {
        return xi(this, "inLeapYear");
      }
      with(e2, t2 = void 0) {
        if (vt(this, yt), !Ae(e2)) throw new TypeError("invalid argument");
        bt(e2);
        const n2 = re(this, E), r2 = re(this, T);
        let o2 = { ...en(n2, r2.isoDate), ...r2.time };
        return o2 = Rn(n2, o2, tn(n2, e2, ["year", "month", "monthCode", "day"], ["hour", "minute", "second", "millisecond", "microsecond", "nanosecond"], "partial")), wn(on(n2, o2, Lt(Zo(t2))), n2);
      }
      withPlainTime(e2 = void 0) {
        vt(this, yt);
        const t2 = un(e2);
        return wn(xt(re(this, T).isoDate, t2), re(this, E));
      }
      withCalendar(e2) {
        vt(this, yt);
        const t2 = kn(e2);
        return wn(re(this, T), t2);
      }
      add(e2, t2 = void 0) {
        return vt(this, yt), bo("add", this, e2, t2);
      }
      subtract(e2, t2 = void 0) {
        return vt(this, yt), bo("subtract", this, e2, t2);
      }
      until(e2, t2 = void 0) {
        return vt(this, yt), ho("until", this, e2, t2);
      }
      since(e2, t2 = void 0) {
        return vt(this, yt), ho("since", this, e2, t2);
      }
      round(e2) {
        if (vt(this, yt), void 0 === e2) throw new TypeError("options parameter is required");
        const t2 = "string" == typeof e2 ? Fo("smallestUnit", e2) : Zo(e2), n2 = Ft(t2), r2 = Ut(t2, "halfExpand"), o2 = Wt(t2, "smallestUnit", "time", qt, ["day"]), i2 = { day: 1, hour: 24, minute: 60, second: 60, millisecond: 1e3, microsecond: 1e3, nanosecond: 1e3 }[o2];
        Ht(n2, i2, 1 === i2);
        const a2 = re(this, T);
        return wn(1 === n2 && "nanosecond" === o2 ? a2 : Co(a2, n2, o2, r2), re(this, E));
      }
      equals(e2) {
        vt(this, yt);
        const t2 = an(e2);
        return 0 === jo(re(this, T), re(t2, T)) && xn(re(this, E), re(t2, E));
      }
      toString(e2 = void 0) {
        vt(this, yt);
        const t2 = Zo(e2), n2 = Zt(t2), r2 = zt(t2), o2 = Ut(t2, "trunc"), i2 = Wt(t2, "smallestUnit", "time", void 0);
        if ("hour" === i2) throw new RangeError('smallestUnit must be a time unit other than "hour"');
        const { precision: a2, unit: s2, increment: c2 } = At(i2, r2), d2 = Co(re(this, T), c2, s2, o2);
        return Br(d2), nr(d2, re(this, E), a2, n2);
      }
      toJSON() {
        return vt(this, yt), nr(re(this, T), re(this, E), "auto");
      }
      toLocaleString(e2 = void 0, t2 = void 0) {
        return vt(this, yt), new di(e2, t2).format(this);
      }
      valueOf() {
        qo("PlainDateTime");
      }
      toZonedDateTime(e2, t2 = void 0) {
        vt(this, yt);
        const n2 = Bn(e2), r2 = Pt(Zo(t2));
        return $n(An(n2, re(this, T), r2), n2, re(this, E));
      }
      toPlainDate() {
        return vt(this, yt), pn(re(this, T).isoDate, re(this, E));
      }
      toPlainTime() {
        return vt(this, yt), Tn(re(this, T).time);
      }
      static from(e2, t2 = void 0) {
        return an(e2, t2);
      }
      static compare(e2, t2) {
        const n2 = an(e2), r2 = an(t2);
        return jo(re(n2, T), re(r2, T));
      }
    };
    function xi(e2, t2) {
      vt(e2, yt);
      const n2 = re(e2, T).isoDate;
      return Qt(e2).isoToDate(n2, { [t2]: true })[t2];
    }
    function Li(e2, t2) {
      return vt(e2, yt), re(e2, T).time[t2];
    }
    ae(PlainDateTime, "Temporal.PlainDateTime");
    var Duration = class _Duration {
      constructor(e2 = 0, t2 = 0, n2 = 0, r2 = 0, o2 = 0, i2 = 0, a2 = 0, s2 = 0, c2 = 0, d2 = 0) {
        const h2 = void 0 === e2 ? 0 : Ge(e2), u2 = void 0 === t2 ? 0 : Ge(t2), l2 = void 0 === n2 ? 0 : Ge(n2), m2 = void 0 === r2 ? 0 : Ge(r2), f2 = void 0 === o2 ? 0 : Ge(o2), y2 = void 0 === i2 ? 0 : Ge(i2), p2 = void 0 === a2 ? 0 : Ge(a2), g2 = void 0 === s2 ? 0 : Ge(s2), w2 = void 0 === c2 ? 0 : Ge(c2), v2 = void 0 === d2 ? 0 : Ge(d2);
        zr(h2, u2, l2, m2, f2, y2, p2, g2, w2, v2), te(this), oe(this, Y, h2), oe(this, R, u2), oe(this, S, l2), oe(this, j, m2), oe(this, k, f2), oe(this, N, y2), oe(this, x, p2), oe(this, L, g2), oe(this, P, w2), oe(this, U, v2);
      }
      get years() {
        return vt(this, lt), re(this, Y);
      }
      get months() {
        return vt(this, lt), re(this, R);
      }
      get weeks() {
        return vt(this, lt), re(this, S);
      }
      get days() {
        return vt(this, lt), re(this, j);
      }
      get hours() {
        return vt(this, lt), re(this, k);
      }
      get minutes() {
        return vt(this, lt), re(this, N);
      }
      get seconds() {
        return vt(this, lt), re(this, x);
      }
      get milliseconds() {
        return vt(this, lt), re(this, L);
      }
      get microseconds() {
        return vt(this, lt), re(this, P);
      }
      get nanoseconds() {
        return vt(this, lt), re(this, U);
      }
      get sign() {
        return vt(this, lt), Mr(this);
      }
      get blank() {
        return vt(this, lt), 0 === Mr(this);
      }
      with(e2) {
        vt(this, lt);
        const t2 = kt(e2), { years: n2 = re(this, Y), months: r2 = re(this, R), weeks: o2 = re(this, S), days: i2 = re(this, j), hours: a2 = re(this, k), minutes: s2 = re(this, N), seconds: c2 = re(this, x), milliseconds: d2 = re(this, L), microseconds: h2 = re(this, P), nanoseconds: u2 = re(this, U) } = t2;
        return new _Duration(n2, r2, o2, i2, a2, s2, c2, d2, h2, u2);
      }
      negated() {
        return vt(this, lt), Sr(this);
      }
      abs() {
        return vt(this, lt), new _Duration(Math.abs(re(this, Y)), Math.abs(re(this, R)), Math.abs(re(this, S)), Math.abs(re(this, j)), Math.abs(re(this, k)), Math.abs(re(this, N)), Math.abs(re(this, x)), Math.abs(re(this, L)), Math.abs(re(this, P)), Math.abs(re(this, U)));
      }
      add(e2) {
        return vt(this, lt), go("add", this, e2);
      }
      subtract(e2) {
        return vt(this, lt), go("subtract", this, e2);
      }
      round(e2) {
        if (vt(this, lt), void 0 === e2) throw new TypeError("options parameter is required");
        const t2 = Jt(this), n2 = "string" == typeof e2 ? Fo("smallestUnit", e2) : Zo(e2);
        let r2 = Wt(n2, "largestUnit", "datetime", void 0, ["auto"]), { plainRelativeTo: o2, zonedRelativeTo: i2 } = _t(n2);
        const a2 = Ft(n2), s2 = Ut(n2, "halfExpand");
        let c2 = Wt(n2, "smallestUnit", "datetime", void 0), d2 = true;
        c2 || (d2 = false, c2 = "nanosecond");
        const h2 = Gt(t2, c2);
        let u2 = true;
        if (r2 || (u2 = false, r2 = h2), "auto" === r2 && (r2 = h2), !d2 && !u2) throw new RangeError("at least one of smallestUnit or largestUnit is required");
        if (Gt(r2, c2) !== r2) throw new RangeError(`largestUnit ${r2} cannot be smaller than smallestUnit ${c2}`);
        const l2 = { hour: 24, minute: 60, second: 60, millisecond: 1e3, microsecond: 1e3, nanosecond: 1e3 }[c2];
        if (void 0 !== l2 && Ht(a2, l2, false), a2 > 1 && "date" === Vt(c2) && r2 !== c2) throw new RangeError("For calendar units with roundingIncrement > 1, use largestUnit = smallestUnit");
        if (i2) {
          let e3 = Ar(this);
          const t3 = re(i2, $), n3 = re(i2, E), o3 = re(i2, b);
          return e3 = io(o3, po(o3, t3, n3, e3), t3, n3, r2, a2, c2, s2), "date" === Vt(r2) && (r2 = "hour"), _r(e3, r2);
        }
        if (o2) {
          let e3 = qr(this);
          const t3 = fo({ deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }, e3.time), n3 = re(o2, D), i3 = re(o2, E), d3 = Sn(i3, n3, Nt(e3.date, t3.deltaDays), "constrain");
          return e3 = oo(xt(n3, { deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }), xt(d3, t3), i3, r2, a2, c2, s2), _r(e3, r2);
        }
        if (Kt(t2)) throw new RangeError(`a starting point is required for ${t2}s balancing`);
        if (Kt(r2)) throw new RangeError(`a starting point is required for ${r2}s balancing`);
        let m2 = qr(this);
        if ("day" === c2) {
          const { quotient: e3, remainder: t3 } = m2.time.divmod(Se);
          let n3 = m2.date.days + e3 + Yo(t3, "day");
          n3 = Eo(n3, a2, s2), m2 = Jr({ years: 0, months: 0, weeks: 0, days: n3 }, TimeDuration.ZERO);
        } else m2 = Jr({ years: 0, months: 0, weeks: 0, days: 0 }, $o(m2.time, a2, c2, s2));
        return _r(m2, r2);
      }
      total(t2) {
        if (vt(this, lt), void 0 === t2) throw new TypeError("options argument is required");
        const n2 = "string" == typeof t2 ? Fo("unit", t2) : Zo(t2);
        let { plainRelativeTo: r2, zonedRelativeTo: o2 } = _t(n2);
        const i2 = Wt(n2, "unit", "datetime", qt);
        if (o2) {
          const e2 = Ar(this), t3 = re(o2, $), n3 = re(o2, E), r3 = re(o2, b);
          return (function(e3, t4, n4, r4, o3) {
            return "time" === Vt(o3) ? Yo(TimeDuration.fromEpochNsDiff(t4, e3), o3) : ro(eo(e3, t4, n4, r4, o3), t4, zn(n4, e3), n4, r4, o3);
          })(r3, po(r3, t3, n3, e2), t3, n3, i2);
        }
        if (r2) {
          const t3 = qr(this);
          let n3 = fo({ deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }, t3.time);
          const o3 = re(r2, D), a3 = re(r2, E), s2 = Sn(a3, o3, Nt(t3.date, n3.deltaDays), "constrain");
          return (function(t4, n4, r3, o4) {
            if (0 == jo(t4, n4)) return 0;
            Br(t4), Br(n4);
            const i3 = Qr(t4, n4, r3, o4);
            return "nanosecond" === o4 ? e.toNumber(i3.time.totalNs) : ro(i3, pr(n4), t4, null, r3, o4);
          })(xt(o3, { deltaDays: 0, hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }), xt(s2, n3), a3, i2);
        }
        const a2 = Jt(this);
        if (Kt(a2)) throw new RangeError(`a starting point is required for ${a2}s total`);
        if (Kt(i2)) throw new RangeError(`a starting point is required for ${i2}s total`);
        return Yo(qr(this).time, i2);
      }
      toString(e2 = void 0) {
        vt(this, lt);
        const t2 = Zo(e2), n2 = zt(t2), r2 = Ut(t2, "trunc"), o2 = Wt(t2, "smallestUnit", "time", void 0);
        if ("hour" === o2 || "minute" === o2) throw new RangeError('smallestUnit must be a time unit other than "hours" or "minutes"');
        const { precision: i2, unit: a2, increment: s2 } = At(o2, n2);
        if ("nanosecond" === a2 && 1 === s2) return Qn(this, i2);
        const c2 = Jt(this);
        let d2 = Ar(this);
        const h2 = $o(d2.time, s2, a2, r2);
        return d2 = Jr(d2.date, h2), Qn(_r(d2, Gt(c2, "second")), i2);
      }
      toJSON() {
        return vt(this, lt), Qn(this, "auto");
      }
      toLocaleString(e2 = void 0, t2 = void 0) {
        if (vt(this, lt), "function" == typeof Intl.DurationFormat) {
          const n2 = new Intl.DurationFormat(e2, t2);
          return ji.call(n2, this);
        }
        return console.warn("Temporal.Duration.prototype.toLocaleString() requires Intl.DurationFormat."), Qn(this, "auto");
      }
      valueOf() {
        qo("Duration");
      }
      static from(e2) {
        return sn(e2);
      }
      static compare(t2, n2, r2 = void 0) {
        const o2 = sn(t2), i2 = sn(n2), a2 = Zo(r2), { plainRelativeTo: s2, zonedRelativeTo: c2 } = _t(a2);
        if (re(o2, Y) === re(i2, Y) && re(o2, R) === re(i2, R) && re(o2, S) === re(i2, S) && re(o2, j) === re(i2, j) && re(o2, k) === re(i2, k) && re(o2, N) === re(i2, N) && re(o2, x) === re(i2, x) && re(o2, L) === re(i2, L) && re(o2, P) === re(i2, P) && re(o2, U) === re(i2, U)) return 0;
        const d2 = Jt(o2), h2 = Jt(i2), u2 = Ar(o2), l2 = Ar(i2);
        if (c2 && ("date" === Vt(d2) || "date" === Vt(h2))) {
          const t3 = re(c2, $), n3 = re(c2, E), r3 = re(c2, b), o3 = po(r3, t3, n3, u2), i3 = po(r3, t3, n3, l2);
          return Bo(e.toNumber(e.subtract(o3, i3)));
        }
        let m2 = u2.date.days, f2 = l2.date.days;
        if (Kt(d2) || Kt(h2)) {
          if (!s2) throw new RangeError("A starting point is required for years, months, or weeks comparison");
          m2 = Rr(u2.date, s2), f2 = Rr(l2.date, s2);
        }
        const y2 = u2.time.add24HourDays(m2), p2 = l2.time.add24HourDays(f2);
        return y2.cmp(p2);
      }
    };
    ae(Duration, "Temporal.Duration");
    var PlainMonthDay = class {
      constructor(e2, t2, n2 = "iso8601", r2 = 1972) {
        const o2 = _e(e2), i2 = _e(t2), a2 = zo(void 0 === n2 ? "iso8601" : Ve(n2)), s2 = _e(r2);
        xr(s2, o2, i2), vn(this, { year: s2, month: o2, day: i2 }, a2);
      }
      get monthCode() {
        return Pi(this, "monthCode");
      }
      get day() {
        return Pi(this, "day");
      }
      get calendarId() {
        return vt(this, gt), re(this, E);
      }
      with(e2, t2 = void 0) {
        if (vt(this, gt), !Ae(e2)) throw new TypeError("invalid argument");
        bt(e2);
        const n2 = re(this, E);
        let r2 = en(n2, re(this, D), "month-day");
        return r2 = Rn(n2, r2, tn(n2, e2, ["year", "month", "monthCode", "day"], [], "partial")), bn(Un(n2, r2, Lt(Zo(t2))), n2);
      }
      equals(e2) {
        vt(this, gt);
        const t2 = dn(e2);
        return 0 === Ro(re(this, D), re(t2, D)) && xn(re(this, E), re(t2, E));
      }
      toString(e2 = void 0) {
        return vt(this, gt), rr(this, Zt(Zo(e2)));
      }
      toJSON() {
        return vt(this, gt), rr(this);
      }
      toLocaleString(e2 = void 0, t2 = void 0) {
        return vt(this, gt), new di(e2, t2).format(this);
      }
      valueOf() {
        qo("PlainMonthDay");
      }
      toPlainDate(e2) {
        if (vt(this, gt), !Ae(e2)) throw new TypeError("argument should be an object");
        const t2 = re(this, E);
        return pn(Ln(t2, Rn(t2, en(t2, re(this, D), "month-day"), tn(t2, e2, ["year"], [], [])), "constrain"), t2);
      }
      static from(e2, t2 = void 0) {
        return dn(e2, t2);
      }
    };
    function Pi(e2, t2) {
      vt(e2, gt);
      const n2 = re(e2, D);
      return Qt(e2).isoToDate(n2, { [t2]: true })[t2];
    }
    function Ui(e2) {
      return zn(e2, Po());
    }
    ae(PlainMonthDay, "Temporal.PlainMonthDay");
    var Bi = { instant: () => Cn(Po()), plainDateTimeISO: (e2 = Uo()) => wn(Ui(Bn(e2)), "iso8601"), plainDateISO: (e2 = Uo()) => pn(Ui(Bn(e2)).isoDate, "iso8601"), plainTimeISO: (e2 = Uo()) => Tn(Ui(Bn(e2)).time), timeZoneId: () => Uo(), zonedDateTimeISO: (e2 = Uo()) => {
      const t2 = Bn(e2);
      return $n(Po(), t2, "iso8601");
    }, [Symbol.toStringTag]: "Temporal.Now" };
    Object.defineProperty(Bi, Symbol.toStringTag, { value: "Temporal.Now", writable: false, enumerable: false, configurable: true });
    var PlainTime = class _PlainTime {
      constructor(e2 = 0, t2 = 0, n2 = 0, r2 = 0, o2 = 0, i2 = 0) {
        const a2 = void 0 === e2 ? 0 : _e(e2), s2 = void 0 === t2 ? 0 : _e(t2), c2 = void 0 === n2 ? 0 : _e(n2), d2 = void 0 === r2 ? 0 : _e(r2), h2 = void 0 === o2 ? 0 : _e(o2), u2 = void 0 === i2 ? 0 : _e(i2);
        Pr(a2, s2, c2, d2, h2, u2), Dn(this, { hour: a2, minute: s2, second: c2, millisecond: d2, microsecond: h2, nanosecond: u2 });
      }
      get hour() {
        return vt(this, ft), re(this, M).hour;
      }
      get minute() {
        return vt(this, ft), re(this, M).minute;
      }
      get second() {
        return vt(this, ft), re(this, M).second;
      }
      get millisecond() {
        return vt(this, ft), re(this, M).millisecond;
      }
      get microsecond() {
        return vt(this, ft), re(this, M).microsecond;
      }
      get nanosecond() {
        return vt(this, ft), re(this, M).nanosecond;
      }
      with(e2, t2 = void 0) {
        if (vt(this, ft), !Ae(e2)) throw new TypeError("invalid argument");
        bt(e2);
        const n2 = nn(e2, "partial"), r2 = nn(this);
        let { hour: o2, minute: i2, second: a2, millisecond: s2, microsecond: c2, nanosecond: d2 } = Object.assign(r2, n2);
        const h2 = Lt(Zo(t2));
        return { hour: o2, minute: i2, second: a2, millisecond: s2, microsecond: c2, nanosecond: d2 } = jt(o2, i2, a2, s2, c2, d2, h2), new _PlainTime(o2, i2, a2, s2, c2, d2);
      }
      add(e2) {
        return vt(this, ft), Do("add", this, e2);
      }
      subtract(e2) {
        return vt(this, ft), Do("subtract", this, e2);
      }
      until(e2, t2 = void 0) {
        return vt(this, ft), uo("until", this, e2, t2);
      }
      since(e2, t2 = void 0) {
        return vt(this, ft), uo("since", this, e2, t2);
      }
      round(e2) {
        if (vt(this, ft), void 0 === e2) throw new TypeError("options parameter is required");
        const t2 = "string" == typeof e2 ? Fo("smallestUnit", e2) : Zo(e2), n2 = Ft(t2), r2 = Ut(t2, "halfExpand"), o2 = Wt(t2, "smallestUnit", "time", qt);
        return Ht(n2, { hour: 24, minute: 60, second: 60, millisecond: 1e3, microsecond: 1e3, nanosecond: 1e3 }[o2], false), Tn(Oo(re(this, M), n2, o2, r2));
      }
      equals(e2) {
        vt(this, ft);
        const t2 = hn(e2);
        return 0 === So(re(this, M), re(t2, M));
      }
      toString(e2 = void 0) {
        vt(this, ft);
        const t2 = Zo(e2), n2 = zt(t2), r2 = Ut(t2, "trunc"), o2 = Wt(t2, "smallestUnit", "time", void 0);
        if ("hour" === o2) throw new RangeError('smallestUnit must be a time unit other than "hour"');
        const { precision: i2, unit: a2, increment: s2 } = At(o2, n2);
        return tr(Oo(re(this, M), s2, a2, r2), i2);
      }
      toJSON() {
        return vt(this, ft), tr(re(this, M), "auto");
      }
      toLocaleString(e2 = void 0, t2 = void 0) {
        return vt(this, ft), new di(e2, t2).format(this);
      }
      valueOf() {
        qo("PlainTime");
      }
      static from(e2, t2 = void 0) {
        return hn(e2, t2);
      }
      static compare(e2, t2) {
        const n2 = hn(e2), r2 = hn(t2);
        return So(re(n2, M), re(r2, M));
      }
    };
    ae(PlainTime, "Temporal.PlainTime");
    var PlainYearMonth = class {
      constructor(e2, t2, n2 = "iso8601", r2 = 1) {
        const o2 = _e(e2), i2 = _e(t2), a2 = zo(void 0 === n2 ? "iso8601" : Ve(n2)), s2 = _e(r2);
        xr(o2, i2, s2), Mn(this, { year: o2, month: i2, day: s2 }, a2);
      }
      get year() {
        return Zi(this, "year");
      }
      get month() {
        return Zi(this, "month");
      }
      get monthCode() {
        return Zi(this, "monthCode");
      }
      get calendarId() {
        return vt(this, pt), re(this, E);
      }
      get era() {
        return Zi(this, "era");
      }
      get eraYear() {
        return Zi(this, "eraYear");
      }
      get daysInMonth() {
        return Zi(this, "daysInMonth");
      }
      get daysInYear() {
        return Zi(this, "daysInYear");
      }
      get monthsInYear() {
        return Zi(this, "monthsInYear");
      }
      get inLeapYear() {
        return Zi(this, "inLeapYear");
      }
      with(e2, t2 = void 0) {
        if (vt(this, pt), !Ae(e2)) throw new TypeError("invalid argument");
        bt(e2);
        const n2 = re(this, E);
        let r2 = en(n2, re(this, D), "year-month");
        return r2 = Rn(n2, r2, tn(n2, e2, ["year", "month", "monthCode"], [], "partial")), En(Pn(n2, r2, Lt(Zo(t2))), n2);
      }
      add(e2, t2 = void 0) {
        return vt(this, pt), To("add", this, e2, t2);
      }
      subtract(e2, t2 = void 0) {
        return vt(this, pt), To("subtract", this, e2, t2);
      }
      until(e2, t2 = void 0) {
        return vt(this, pt), lo("until", this, e2, t2);
      }
      since(e2, t2 = void 0) {
        return vt(this, pt), lo("since", this, e2, t2);
      }
      equals(e2) {
        vt(this, pt);
        const t2 = ln(e2);
        return 0 === Ro(re(this, D), re(t2, D)) && xn(re(this, E), re(t2, E));
      }
      toString(e2 = void 0) {
        return vt(this, pt), or(this, Zt(Zo(e2)));
      }
      toJSON() {
        return vt(this, pt), or(this);
      }
      toLocaleString(e2 = void 0, t2 = void 0) {
        return vt(this, pt), new di(e2, t2).format(this);
      }
      valueOf() {
        qo("PlainYearMonth");
      }
      toPlainDate(e2) {
        if (vt(this, pt), !Ae(e2)) throw new TypeError("argument should be an object");
        const t2 = re(this, E);
        return pn(Ln(t2, Rn(t2, en(t2, re(this, D), "year-month"), tn(t2, e2, ["day"], [], [])), "constrain"), t2);
      }
      static from(e2, t2 = void 0) {
        return ln(e2, t2);
      }
      static compare(e2, t2) {
        const n2 = ln(e2), r2 = ln(t2);
        return Ro(re(n2, D), re(r2, D));
      }
    };
    function Zi(e2, t2) {
      vt(e2, pt);
      const n2 = re(e2, D);
      return Qt(e2).isoToDate(n2, { [t2]: true })[t2];
    }
    ae(PlainYearMonth, "Temporal.PlainYearMonth");
    var Fi = di.prototype.resolvedOptions;
    var ZonedDateTime = class {
      constructor(e2, t2, n2 = "iso8601") {
        if (arguments.length < 1) throw new TypeError("missing argument: epochNanoseconds is required");
        const r2 = Lo(e2);
        let o2 = Ve(t2);
        const { tzName: i2, offsetMinutes: a2 } = Rt(o2);
        if (void 0 === a2) {
          const e3 = hr(i2);
          if (!e3) throw new RangeError(`unknown time zone ${i2}`);
          o2 = e3.identifier;
        } else o2 = mr(a2);
        On(this, r2, o2, zo(void 0 === n2 ? "iso8601" : Ve(n2)));
      }
      get calendarId() {
        return vt(this, wt), re(this, E);
      }
      get timeZoneId() {
        return vt(this, wt), re(this, $);
      }
      get year() {
        return zi(this, "year");
      }
      get month() {
        return zi(this, "month");
      }
      get monthCode() {
        return zi(this, "monthCode");
      }
      get day() {
        return zi(this, "day");
      }
      get hour() {
        return Ai(this, "hour");
      }
      get minute() {
        return Ai(this, "minute");
      }
      get second() {
        return Ai(this, "second");
      }
      get millisecond() {
        return Ai(this, "millisecond");
      }
      get microsecond() {
        return Ai(this, "microsecond");
      }
      get nanosecond() {
        return Ai(this, "nanosecond");
      }
      get era() {
        return zi(this, "era");
      }
      get eraYear() {
        return zi(this, "eraYear");
      }
      get epochMilliseconds() {
        return vt(this, wt), No(re(this, b), "floor");
      }
      get epochNanoseconds() {
        return vt(this, wt), ko(re(this, b));
      }
      get dayOfWeek() {
        return zi(this, "dayOfWeek");
      }
      get dayOfYear() {
        return zi(this, "dayOfYear");
      }
      get weekOfYear() {
        return zi(this, "weekOfYear")?.week;
      }
      get yearOfWeek() {
        return zi(this, "weekOfYear")?.year;
      }
      get hoursInDay() {
        vt(this, wt);
        const e2 = re(this, $), t2 = Hi(this).isoDate, n2 = Or(t2.year, t2.month, t2.day + 1), r2 = _n(e2, t2), o2 = _n(e2, n2);
        return Yo(TimeDuration.fromEpochNsDiff(o2, r2), "hour");
      }
      get daysInWeek() {
        return zi(this, "daysInWeek");
      }
      get daysInMonth() {
        return zi(this, "daysInMonth");
      }
      get daysInYear() {
        return zi(this, "daysInYear");
      }
      get monthsInYear() {
        return zi(this, "monthsInYear");
      }
      get inLeapYear() {
        return zi(this, "inLeapYear");
      }
      get offset() {
        return vt(this, wt), Hn(Fn(re(this, $), re(this, b)));
      }
      get offsetNanoseconds() {
        return vt(this, wt), Fn(re(this, $), re(this, b));
      }
      with(e2, t2 = void 0) {
        if (vt(this, wt), !Ae(e2)) throw new TypeError("invalid zoned-date-time-like");
        bt(e2);
        const n2 = re(this, E), r2 = re(this, $), o2 = Fn(r2, re(this, b)), i2 = Hi(this);
        let a2 = { ...en(n2, i2.isoDate), ...i2.time, offset: Hn(o2) };
        a2 = Rn(n2, a2, tn(n2, e2, ["year", "month", "monthCode", "day"], ["hour", "minute", "second", "millisecond", "microsecond", "nanosecond", "offset"], "partial"));
        const s2 = Zo(t2), c2 = Pt(s2), d2 = Bt(s2, "prefer"), h2 = on(n2, a2, Lt(s2)), u2 = sr(a2.offset);
        return $n(mn(h2.isoDate, h2.time, "option", u2, r2, c2, d2, false), r2, n2);
      }
      withPlainTime(e2 = void 0) {
        vt(this, wt);
        const t2 = re(this, $), n2 = re(this, E), r2 = Hi(this).isoDate;
        let o2;
        return o2 = void 0 === e2 ? _n(t2, r2) : An(t2, xt(r2, re(hn(e2), M)), "compatible"), $n(o2, t2, n2);
      }
      withTimeZone(e2) {
        vt(this, wt);
        const t2 = Bn(e2);
        return $n(re(this, b), t2, re(this, E));
      }
      withCalendar(e2) {
        vt(this, wt);
        const t2 = kn(e2);
        return $n(re(this, b), re(this, $), t2);
      }
      add(e2, t2 = void 0) {
        return vt(this, wt), Mo("add", this, e2, t2);
      }
      subtract(e2, t2 = void 0) {
        return vt(this, wt), Mo("subtract", this, e2, t2);
      }
      until(e2, t2 = void 0) {
        return vt(this, wt), mo("until", this, e2, t2);
      }
      since(e2, t2 = void 0) {
        return vt(this, wt), mo("since", this, e2, t2);
      }
      round(t2) {
        if (vt(this, wt), void 0 === t2) throw new TypeError("options parameter is required");
        const n2 = "string" == typeof t2 ? Fo("smallestUnit", t2) : Zo(t2), r2 = Ft(n2), o2 = Ut(n2, "halfExpand"), i2 = Wt(n2, "smallestUnit", "time", qt, ["day"]), a2 = { day: 1, hour: 24, minute: 60, second: 60, millisecond: 1e3, microsecond: 1e3, nanosecond: 1e3 }[i2];
        if (Ht(r2, a2, 1 === a2), "nanosecond" === i2 && 1 === r2) return $n(re(this, b), re(this, $), re(this, E));
        const s2 = re(this, $), c2 = re(this, b), d2 = Hi(this);
        let h2;
        if ("day" === i2) {
          const t3 = d2.isoDate, n3 = Or(t3.year, t3.month, t3.day + 1), r3 = _n(s2, t3), i3 = _n(s2, n3), a3 = e.subtract(i3, r3);
          h2 = TimeDuration.fromEpochNsDiff(c2, r3).round(a3, o2).addToEpochNs(r3);
        } else {
          const e2 = Co(d2, r2, i2, o2), t3 = Fn(s2, c2);
          h2 = mn(e2.isoDate, e2.time, "option", t3, s2, "compatible", "prefer", false);
        }
        return $n(h2, s2, re(this, E));
      }
      equals(t2) {
        vt(this, wt);
        const n2 = fn(t2), r2 = re(this, b), o2 = re(n2, b);
        return !!e.equal(e.BigInt(r2), e.BigInt(o2)) && !!Zn(re(this, $), re(n2, $)) && xn(re(this, E), re(n2, E));
      }
      toString(e2 = void 0) {
        vt(this, wt);
        const t2 = Zo(e2), n2 = Zt(t2), r2 = zt(t2), o2 = (function(e3) {
          return Ho(e3, "offset", ["auto", "never"], "auto");
        })(t2), i2 = Ut(t2, "trunc"), a2 = Wt(t2, "smallestUnit", "time", void 0);
        if ("hour" === a2) throw new RangeError('smallestUnit must be a time unit other than "hour"');
        const s2 = (function(e3) {
          return Ho(e3, "timeZoneName", ["auto", "never", "critical"], "auto");
        })(t2), { precision: c2, unit: d2, increment: h2 } = At(a2, r2);
        return ir(this, c2, n2, s2, o2, { unit: d2, increment: h2, roundingMode: i2 });
      }
      toLocaleString(e2 = void 0, t2 = void 0) {
        vt(this, wt);
        const n2 = Zo(t2), r2 = /* @__PURE__ */ Object.create(null);
        if ((function(e3, t3, n3, r3) {
          if (null == t3) return;
          const o3 = Reflect.ownKeys(t3);
          for (let i3 = 0; i3 < o3.length; i3++) {
            const a3 = o3[i3];
            if (!n3.some(((e4) => Object.is(e4, a3))) && Object.prototype.propertyIsEnumerable.call(t3, a3)) {
              const n4 = t3[a3];
              r3, e3[a3] = n4;
            }
          }
        })(r2, n2, ["timeZone"]), void 0 !== n2.timeZone) throw new TypeError("ZonedDateTime toLocaleString does not accept a timeZone option");
        if (void 0 === r2.year && void 0 === r2.month && void 0 === r2.day && void 0 === r2.era && void 0 === r2.weekday && void 0 === r2.dateStyle && void 0 === r2.hour && void 0 === r2.minute && void 0 === r2.second && void 0 === r2.fractionalSecondDigits && void 0 === r2.timeStyle && void 0 === r2.dayPeriod && void 0 === r2.timeZoneName && (r2.timeZoneName = "short"), r2.timeZone = re(this, $), ar(r2.timeZone)) throw new RangeError("toLocaleString does not currently support offset time zones");
        const o2 = new di(e2, r2), i2 = Fi.call(o2).calendar, a2 = re(this, E);
        if ("iso8601" !== a2 && "iso8601" !== i2 && !xn(i2, a2)) throw new RangeError(`cannot format ZonedDateTime with calendar ${a2} in locale with calendar ${i2}`);
        return o2.format(Cn(re(this, b)));
      }
      toJSON() {
        return vt(this, wt), ir(this, "auto");
      }
      valueOf() {
        qo("ZonedDateTime");
      }
      startOfDay() {
        vt(this, wt);
        const e2 = re(this, $);
        return $n(_n(e2, Hi(this).isoDate), e2, re(this, E));
      }
      getTimeZoneTransition(e2) {
        vt(this, wt);
        const t2 = re(this, $);
        if (void 0 === e2) throw new TypeError("options parameter is required");
        const n2 = Ho("string" == typeof e2 ? Fo("direction", e2) : Zo(e2), "direction", ["next", "previous"], qt);
        if (void 0 === n2) throw new TypeError("direction option is required");
        if (ar(t2) || "UTC" === t2) return null;
        const r2 = re(this, b), o2 = "next" === n2 ? wr(t2, r2) : vr(t2, r2);
        return null === o2 ? null : $n(o2, t2, re(this, E));
      }
      toInstant() {
        return vt(this, wt), Cn(re(this, b));
      }
      toPlainDate() {
        return vt(this, wt), pn(Hi(this).isoDate, re(this, E));
      }
      toPlainTime() {
        return vt(this, wt), Tn(Hi(this).time);
      }
      toPlainDateTime() {
        return vt(this, wt), wn(Hi(this), re(this, E));
      }
      static from(e2, t2 = void 0) {
        return fn(e2, t2);
      }
      static compare(t2, n2) {
        const r2 = fn(t2), o2 = fn(n2), i2 = re(r2, b), a2 = re(o2, b);
        return e.lessThan(e.BigInt(i2), e.BigInt(a2)) ? -1 : e.greaterThan(e.BigInt(i2), e.BigInt(a2)) ? 1 : 0;
      }
    };
    function Hi(e2) {
      return zn(re(e2, $), re(e2, b));
    }
    function zi(e2, t2) {
      vt(e2, wt);
      const n2 = Hi(e2).isoDate;
      return Qt(e2).isoToDate(n2, { [t2]: true })[t2];
    }
    function Ai(e2, t2) {
      return vt(e2, wt), Hi(e2).time[t2];
    }
    ae(ZonedDateTime, "Temporal.ZonedDateTime");
    var qi = Object.freeze({ __proto__: null, Duration, Instant, Now: Bi, PlainDate, PlainDateTime, PlainMonthDay, PlainTime, PlainYearMonth, ZonedDateTime });
    var Wi = class LegacyDateImpl {
      toTemporalInstant() {
        return Cn(xo(Date.prototype.valueOf.call(this)));
      }
    }.prototype.toTemporalInstant;
    var _i = [Instant, PlainDate, PlainDateTime, Duration, PlainMonthDay, PlainTime, PlainYearMonth, ZonedDateTime];
    for (const e2 of _i) {
      const t2 = Object.getOwnPropertyDescriptor(e2, "prototype");
      (t2.configurable || t2.enumerable || t2.writable) && (t2.configurable = false, t2.enumerable = false, t2.writable = false, Object.defineProperty(e2, "prototype", t2));
    }
    exports.Intl = ki, exports.Temporal = qi, exports.toTemporalInstant = Wi;
  }
});

// zcode-temporal-entry.mjs
var import_dist = __toESM(require_dist(), 1);
var export_Temporal = import_dist.Temporal;
export {
  export_Temporal as Temporal
};
