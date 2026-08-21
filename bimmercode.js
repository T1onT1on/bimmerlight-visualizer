(function attachBimmerCode(globalScope) {
  "use strict";

  const STAGING1_ADDR = 0x3009;
  const STAGING2_ADDR = 0x300A;
  const STAGING1_LEN = 252;
  const STAGING2_LEN = 168;
  const MAX_BACKUP_SIZE = 16 * 1024 * 1024;

  const SIDE_BY_ADDR = {
    0x43: "left",
    0x44: "right",
  };

  function asBytes(value) {
    if (value instanceof Uint8Array) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (Array.isArray(value)) {
      if (!value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 0xff)) {
        throw new TypeError("字节数组包含0–255以外的值");
      }
      return Uint8Array.from(value);
    }
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    throw new TypeError("需要 ArrayBuffer 或 Uint8Array");
  }

  function readUnsigned(bytes, offset, size, label = "整数") {
    if (!Number.isInteger(size) || size < 1 || size > 8 || offset < 0 || offset + size > bytes.length) {
      throw new Error(`${label}超出文件范围`);
    }
    let value = 0n;
    for (let index = 0; index < size; index += 1) {
      value = (value << 8n) | BigInt(bytes[offset + index]);
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label}过大`);
    return Number(value);
  }

  function ascii(bytes, offset, length) {
    let result = "";
    for (let index = 0; index < length; index += 1) {
      result += String.fromCharCode(bytes[offset + index]);
    }
    return result;
  }

  class BinaryPlistReader {
    constructor(input) {
      this.bytes = asBytes(input);
      this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
      this.cache = new Map();
      this.parsing = new Set();
      this.dataMeta = new Map();
      this.dataMetaByValue = new WeakMap();
      this.offsets = [];
      this.objectRefSize = 0;
    }

    readLength(offset, info) {
      if (info < 0x0f) return { length: info, payloadOffset: offset + 1 };
      const markerOffset = offset + 1;
      if (markerOffset >= this.bytes.length) throw new Error("扩展长度缺少整数标记");
      const marker = this.bytes[markerOffset];
      if ((marker >> 4) !== 0x01) throw new Error("扩展长度不是整数对象");
      const integerSize = 2 ** (marker & 0x0f);
      const length = readUnsigned(this.bytes, markerOffset + 1, integerSize, "扩展长度");
      return { length, payloadOffset: markerOffset + 1 + integerSize };
    }

    readRef(offset) {
      return readUnsigned(this.bytes, offset, this.objectRefSize, "对象引用");
    }

    parseObject(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.offsets.length) {
        throw new Error(`无效对象引用 ${index}`);
      }
      if (this.cache.has(index)) return this.cache.get(index);
      if (this.parsing.has(index)) throw new Error(`binary plist 包含循环对象引用 ${index}`);
      this.parsing.add(index);

      const offset = this.offsets[index];
      if (offset < 8 || offset >= this.bytes.length - 32) throw new Error(`对象 ${index} 偏移无效`);
      const marker = this.bytes[offset];
      const type = marker >> 4;
      const info = marker & 0x0f;
      let value;

      if (type === 0x00) {
        if (info === 0x00) value = null;
        else if (info === 0x08) value = false;
        else if (info === 0x09) value = true;
        else if (info === 0x0f) value = null;
        else throw new Error(`不支持的简单对象 0x${marker.toString(16)}`);
      } else if (type === 0x01) {
        value = readUnsigned(this.bytes, offset + 1, 2 ** info, `对象 ${index} 整数`);
      } else if (type === 0x02) {
        const size = 2 ** info;
        if (size === 4) value = this.view.getFloat32(offset + 1, false);
        else if (size === 8) value = this.view.getFloat64(offset + 1, false);
        else throw new Error(`对象 ${index} 的浮点长度不受支持`);
      } else if (type === 0x03) {
        if (info !== 0x03) throw new Error(`对象 ${index} 的日期格式无效`);
        value = new Date((this.view.getFloat64(offset + 1, false) + 978307200) * 1000);
      } else if (type === 0x04) {
        const lengthInfo = this.readLength(offset, info);
        const end = lengthInfo.payloadOffset + lengthInfo.length;
        if (end > this.bytes.length - 32) throw new Error(`对象 ${index} 的 NSData 越界`);
        value = this.bytes.slice(lengthInfo.payloadOffset, end);
        this.dataMeta.set(index, {
          objectOffset: offset,
          payloadOffset: lengthInfo.payloadOffset,
          length: lengthInfo.length,
        });
        this.dataMetaByValue.set(value, this.dataMeta.get(index));
      } else if (type === 0x05 || type === 0x07) {
        const lengthInfo = this.readLength(offset, info);
        if (lengthInfo.payloadOffset + lengthInfo.length > this.bytes.length) {
          throw new Error(`对象 ${index} 的字符串越界`);
        }
        value = new TextDecoder(type === 0x07 ? "utf-8" : "windows-1252").decode(
          this.bytes.subarray(lengthInfo.payloadOffset, lengthInfo.payloadOffset + lengthInfo.length),
        );
      } else if (type === 0x06) {
        const lengthInfo = this.readLength(offset, info);
        const byteLength = lengthInfo.length * 2;
        if (lengthInfo.payloadOffset + byteLength > this.bytes.length) {
          throw new Error(`对象 ${index} 的 UTF-16 字符串越界`);
        }
        let text = "";
        for (let cursor = 0; cursor < byteLength; cursor += 2) {
          text += String.fromCharCode(this.view.getUint16(lengthInfo.payloadOffset + cursor, false));
        }
        value = text;
      } else if (type === 0x08) {
        value = { __bimmerCodeUid: readUnsigned(this.bytes, offset + 1, info + 1, `对象 ${index} UID`) };
      } else if (type === 0x0a || type === 0x0c) {
        const lengthInfo = this.readLength(offset, info);
        const refsEnd = lengthInfo.payloadOffset + lengthInfo.length * this.objectRefSize;
        if (refsEnd > this.bytes.length) throw new Error(`对象 ${index} 的数组引用越界`);
        value = [];
        this.cache.set(index, value);
        for (let item = 0; item < lengthInfo.length; item += 1) {
          value.push(this.parseObject(this.readRef(lengthInfo.payloadOffset + item * this.objectRefSize)));
        }
      } else if (type === 0x0d) {
        const lengthInfo = this.readLength(offset, info);
        const keysOffset = lengthInfo.payloadOffset;
        const valuesOffset = keysOffset + lengthInfo.length * this.objectRefSize;
        const refsEnd = valuesOffset + lengthInfo.length * this.objectRefSize;
        if (refsEnd > this.bytes.length) throw new Error(`对象 ${index} 的字典引用越界`);
        value = Object.create(null);
        this.cache.set(index, value);
        for (let item = 0; item < lengthInfo.length; item += 1) {
          const key = this.parseObject(this.readRef(keysOffset + item * this.objectRefSize));
          if (typeof key !== "string") throw new Error(`对象 ${index} 包含非字符串字典键`);
          value[key] = this.parseObject(this.readRef(valuesOffset + item * this.objectRefSize));
        }
      } else {
        throw new Error(`不支持的 binary plist 对象类型 0x${type.toString(16)}`);
      }

      this.cache.set(index, value);
      this.parsing.delete(index);
      return value;
    }

    parse() {
      if (this.bytes.length < 40 || ascii(this.bytes, 0, 8) !== "bplist00") {
        throw new Error("不是 Apple binary plist（缺少 bplist00）");
      }
      if (this.bytes.length > MAX_BACKUP_SIZE) throw new Error("备份文件超过16MB安全限制");

      const trailer = this.bytes.length - 32;
      const offsetIntSize = this.bytes[trailer + 6];
      this.objectRefSize = this.bytes[trailer + 7];
      const objectCount = readUnsigned(this.bytes, trailer + 8, 8, "对象数量");
      const topObject = readUnsigned(this.bytes, trailer + 16, 8, "顶层对象");
      const offsetTableOffset = readUnsigned(this.bytes, trailer + 24, 8, "偏移表位置");

      if (!offsetIntSize || !this.objectRefSize || objectCount < 1 || objectCount > 100000) {
        throw new Error("binary plist trailer 参数无效");
      }
      if (topObject >= objectCount) throw new Error("binary plist 顶层对象无效");
      if (offsetTableOffset < 8 || offsetTableOffset + objectCount * offsetIntSize > trailer) {
        throw new Error("binary plist 偏移表越界");
      }

      for (let index = 0; index < objectCount; index += 1) {
        this.offsets.push(
          readUnsigned(this.bytes, offsetTableOffset + index * offsetIntSize, offsetIntSize, "对象偏移"),
        );
      }
      return {
        root: this.parseObject(topObject),
        dataMeta: this.dataMeta,
        dataMetaByValue: this.dataMetaByValue,
      };
    }
  }

  function uidIndex(value) {
    return value && Number.isInteger(value.__bimmerCodeUid) ? value.__bimmerCodeUid : null;
  }

  function resolve(objects, value) {
    const index = uidIndex(value);
    if (index === null) return value;
    if (!Array.isArray(objects) || index < 0 || index >= objects.length) {
      throw new Error(`NSKeyedArchiver UID ${index} 越界`);
    }
    return objects[index];
  }

  function inspectBackup(input, name = "backup.cod") {
    const bytes = asBytes(input).slice();
    const parsed = new BinaryPlistReader(bytes).parse();
    const archive = parsed.root;
    if (!archive || archive.$archiver !== "NSKeyedArchiver") {
      throw new Error(`${name}：不是 NSKeyedArchiver 备份`);
    }
    const objects = archive.$objects;
    if (!Array.isArray(objects)) throw new Error(`${name}：缺少 $objects`);
    const root = resolve(objects, archive.$top?.root);
    if (!root || typeof root !== "object") throw new Error(`${name}：根对象无效`);

    const codingData = resolve(objects, root.codingData);
    const blockArray = resolve(objects, codingData?.mutableCodingDataBlocks);
    const blockRefs = blockArray?.["NS.objects"];
    if (!Array.isArray(blockRefs)) throw new Error(`${name}：缺少 Coding Data Blocks`);

    const blocks = new Map();
    blockRefs.forEach((blockRef) => {
      const block = resolve(objects, blockRef);
      const address = block?.blockAddress;
      const dataIndex = uidIndex(block?.data);
      const data = resolve(objects, block?.data);
      if (!Number.isInteger(address) || !(data instanceof Uint8Array) || dataIndex === null) return;
      const meta = parsed.dataMetaByValue.get(data);
      if (!meta || meta.length !== data.length) throw new Error(`${name}：Block 0x${address.toString(16)} NSData定位失败`);
      blocks.set(address, { address, data, dataIndex, ...meta });
    });

    const codingEcu = resolve(objects, root.codingECU);
    const ecuAddress = codingEcu?.address;
    const identifier = resolve(objects, codingEcu?.identifier);
    const vin = resolve(objects, root.VIN);
    const cafd = resolve(objects, codingData?.CAFDIdentifier);
    const side = SIDE_BY_ADDR[ecuAddress] || "unknown";
    const staging1 = blocks.get(STAGING1_ADDR);
    const staging2 = blocks.get(STAGING2_ADDR);
    if (!staging1 || !staging2) throw new Error(`${name}：缺少 0x3009/0x300A`);
    if (staging1.length !== STAGING1_LEN || staging2.length !== STAGING2_LEN) {
      throw new Error(`${name}：0x3009=${staging1.length} Byte，0x300A=${staging2.length} Byte，长度异常`);
    }

    return {
      name,
      bytes,
      blocks,
      side,
      ecuAddress,
      identifier: typeof identifier === "string" ? identifier : "",
      vin: typeof vin === "string" ? vin : "",
      cafd: typeof cafd === "string" ? cafd : "",
      staging1,
      staging2,
    };
  }

  function checkPair(left, right) {
    if (left?.ecuAddress !== 0x43) {
      throw new Error(`LEFT 文件应为地址0x43，实际为${left?.ecuAddress == null ? "未知" : `0x${left.ecuAddress.toString(16).toUpperCase()}`}`);
    }
    if (right?.ecuAddress !== 0x44) {
      throw new Error(`RIGHT 文件应为地址0x44，实际为${right?.ecuAddress == null ? "未知" : `0x${right.ecuAddress.toString(16).toUpperCase()}`}`);
    }
    if (!left.vin || left.vin !== right.vin) throw new Error("左右备份VIN不一致");
    return true;
  }

  function normalizePayload(input, length, label) {
    const source = asBytes(input);
    if (source.length > length) throw new Error(`${label}为${source.length} Byte，超过${length} Byte`);
    const output = new Uint8Array(length);
    output.set(source);
    return output;
  }

  function equalBytes(left, right) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  }

  function patchBackup(info, staging1Input, staging2Input) {
    const staging1 = normalizePayload(staging1Input, STAGING1_LEN, "Staging1");
    const staging2 = normalizePayload(staging2Input, STAGING2_LEN, "Staging2");
    const output = info.bytes.slice();

    for (const [block, replacement] of [[info.staging1, staging1], [info.staging2, staging2]]) {
      const current = output.slice(block.payloadOffset, block.payloadOffset + block.length);
      if (!equalBytes(current, block.data)) throw new Error(`${info.name}：原始NSData已变化，拒绝覆盖`);
      output.set(replacement, block.payloadOffset);
    }

    const verified = inspectBackup(output, info.name);
    if (verified.bytes.length !== info.bytes.length) throw new Error(`${info.name}：输出文件大小发生变化`);
    if (verified.ecuAddress !== info.ecuAddress || verified.identifier !== info.identifier || verified.vin !== info.vin) {
      throw new Error(`${info.name}：写入后ECU身份校验失败`);
    }
    if (!equalBytes(verified.staging1.data, staging1) || !equalBytes(verified.staging2.data, staging2)) {
      throw new Error(`${info.name}：写入后Staging校验失败`);
    }
    return { bytes: output, info: verified };
  }

  function outputName(name, timestamp) {
    const safeName = String(name || "backup.cod").replace(/^.*[\\/]/, "");
    const match = safeName.match(/^(.*)-(\d+)\.cod$/i);
    if (match) return `${match[1]}-${timestamp}.cod`;
    const stem = safeName.replace(/\.cod$/i, "");
    return `${stem}-modified-${timestamp}.cod`;
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let value = 0; value < 256; value += 1) {
      let crc = value;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      table[value] = crc >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concatBytes(chunks) {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  }

  function dosTimestamp(date) {
    const year = Math.min(2107, Math.max(1980, date.getFullYear()));
    return {
      time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f),
      date: ((year - 1980) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f),
    };
  }

  function createZip(files, now = new Date()) {
    const encoder = new TextEncoder();
    const localChunks = [];
    const centralChunks = [];
    const stamp = dosTimestamp(now);
    let localOffset = 0;

    files.forEach((file) => {
      const name = encoder.encode(file.name);
      const data = asBytes(file.bytes);
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, stamp.time, true);
      localView.setUint16(12, stamp.date, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, name.length, true);
      localView.setUint16(28, 0, true);
      local.set(name, 30);
      localChunks.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, stamp.time, true);
      centralView.setUint16(14, stamp.date, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, localOffset, true);
      central.set(name, 46);
      centralChunks.push(central);
      localOffset += local.length + data.length;
    });

    const centralDirectory = concatBytes(centralChunks);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, localOffset, true);
    endView.setUint16(20, 0, true);
    return concatBytes([...localChunks, centralDirectory, end]);
  }

  const api = {
    STAGING1_ADDR,
    STAGING2_ADDR,
    STAGING1_LEN,
    STAGING2_LEN,
    checkPair,
    createZip,
    inspectBackup,
    outputName,
    patchBackup,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.BimmerCodeBackup = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
