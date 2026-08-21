(function attachWelcomeLightCore(globalScope) {
  "use strict";

  // Staging sequence identifiers are not LMxx hardware-function IDs. These
  // five roles were identified directly on a G20 PreLCI EU Laserlight car.
  const CHANNELS = {
    0x01: { code: "STG-01", name: "近光主/高亮层", kind: "low", color: "#a8efff", verified: true },
    0x02: { code: "STG-02", name: "DRL 主增亮层", kind: "drl", color: "#ff8a47", verified: true },
    0x03: { code: "STG-03", name: "DRL 过渡层", kind: "drl", color: "#fffd07", verified: true },
    0x04: { code: "STG-04", name: "近光低增益层", kind: "low", color: "#2469ff", verified: true },
    0x05: { code: "STG-05", name: "近光高增益层", kind: "low", color: "#c67aff", verified: true },
  };

  const G20_PRELCI_PROFILE = {
    id: "g20-2020-prelci-eu-5az",
    name: "G20 2020 PreLCI EU / 5AZ Laserlight",
    lowGain: {
      0x01: 1,
      0x04: 0.32,
      0x05: 1,
    },
  };

  const LIMITS = {
    staging1: 252,
    staging2: 168,
  };

  function hexByte(value) {
    return Number(value).toString(16).padStart(2, "0").toUpperCase();
  }

  function parseByteString(input, label = "数据") {
    const text = String(input || "").trim();
    if (!text) {
      return { bytes: [], errors: [], warnings: [] };
    }

    const bytes = [];
    const errors = [];
    const parts = text.split(/[\s,;]+/).filter(Boolean);

    parts.forEach((part, index) => {
      const normalized = part.replace(/^0x/i, "");
      if (!/^[0-9a-f]{2}$/i.test(normalized)) {
        errors.push(`${label}：第 ${index + 1} 个值“${part}”不是两位十六进制字节`);
        return;
      }
      bytes.push(parseInt(normalized, 16));
    });

    return { bytes, errors, warnings: [] };
  }

  function buildTrack(identifier, data) {
    let time = 0;
    const points = [{ time: 0, brightness: 0, rawBrightness: 0 }];

    for (let index = 0; index < data.length; index += 2) {
      const duration = data[index] * 10;
      const rawBrightness = data[index + 1];
      time += duration;
      points.push({
        time,
        brightness: Math.min(rawBrightness, 100),
        rawBrightness,
        duration,
      });
    }

    return {
      identifier,
      identifierHex: hexByte(identifier),
      channel: CHANNELS[identifier] || {
        code: `CH${hexByte(identifier)}`,
        name: "未知通道",
        kind: "unknown",
      },
      pairCount: data.length / 2,
      data,
      points,
      duration: time,
      finalBrightness: points[points.length - 1].brightness,
    };
  }

  function parseSequences(bytes, sideLabel) {
    const tracks = [];
    const errors = [];
    const warnings = [];
    let offset = 0;
    let terminated = false;

    while (offset + 3 <= bytes.length) {
      if (bytes[offset] === 0 && bytes[offset + 1] === 0 && bytes[offset + 2] === 0) {
        offset += 3;
        terminated = true;
        break;
      }

      const identifier = bytes[offset];
      const pairCount = (bytes[offset + 1] << 8) | bytes[offset + 2];
      const dataStart = offset + 3;
      const dataEnd = dataStart + pairCount * 2;

      if (identifier === 0) {
        errors.push(`${sideLabel}：偏移 ${offset} 出现无效通道 00`);
        break;
      }
      if (pairCount === 0) {
        errors.push(`${sideLabel}：通道 ${hexByte(identifier)} 的长度为 0`);
        break;
      }
      if (dataEnd > bytes.length) {
        errors.push(
          `${sideLabel}：通道 ${hexByte(identifier)} 声明 ${pairCount} 组数据，但剩余字节不足`,
        );
        break;
      }

      const track = buildTrack(identifier, bytes.slice(dataStart, dataEnd));
      if (track.points.some((point) => point.rawBrightness > 100)) {
        warnings.push(
          `${sideLabel}：通道 ${track.identifierHex} 含有超过 100% 的亮度，预览已限制为 100%`,
        );
      }
      tracks.push(track);
      offset = dataEnd;
    }

    const trailing = bytes.slice(offset);
    if (trailing.some((value) => value !== 0)) {
      warnings.push(`${sideLabel}：终止标记之后仍有非零数据`);
    }
    if (!terminated && bytes.length > 0 && errors.length === 0) {
      warnings.push(`${sideLabel}：未找到 00,00,00 终止标记，已按输入末尾结束`);
    }

    return { tracks, errors, warnings, terminated, consumedBytes: offset };
  }

  function parseSide(staging1Text, staging2Text, sideLabel) {
    const first = parseByteString(staging1Text, `${sideLabel} Staging1`);
    const second = parseByteString(staging2Text, `${sideLabel} Staging2`);
    const errors = [...first.errors, ...second.errors];
    const warnings = [...first.warnings, ...second.warnings];

    if (first.bytes.length > LIMITS.staging1) {
      errors.push(`${sideLabel} Staging1：${first.bytes.length} Byte，超过 ${LIMITS.staging1} Byte`);
    }
    if (second.bytes.length > LIMITS.staging2) {
      errors.push(`${sideLabel} Staging2：${second.bytes.length} Byte，超过 ${LIMITS.staging2} Byte`);
    }

    if (errors.length) {
      return {
        tracks: [],
        errors,
        warnings,
        byteCounts: { staging1: first.bytes.length, staging2: second.bytes.length },
      };
    }

    const parsed = parseSequences([...first.bytes, ...second.bytes], sideLabel);
    return {
      ...parsed,
      errors: [...errors, ...parsed.errors],
      warnings: [...warnings, ...parsed.warnings],
      byteCounts: { staging1: first.bytes.length, staging2: second.bytes.length },
    };
  }

  function parseProject(fields) {
    const left = parseSide(fields.left1, fields.left2, "左侧 FLM2 [43]");
    const right = parseSide(fields.right1, fields.right2, "右侧 FLM2 [44]");
    const errors = [...left.errors, ...right.errors];
    const warnings = [...left.warnings, ...right.warnings];
    const duration = Math.max(
      0,
      ...left.tracks.map((track) => track.duration),
      ...right.tracks.map((track) => track.duration),
    );
    const channelIds = [...new Set([
      ...left.tracks.map((track) => track.identifier),
      ...right.tracks.map((track) => track.identifier),
    ])].sort((a, b) => a - b);

    return {
      left,
      right,
      errors,
      warnings,
      duration,
      channelIds,
      valid: errors.length === 0 && (left.tracks.length > 0 || right.tracks.length > 0),
    };
  }

  function describeTrack(track) {
    const data = Array.isArray(track?.data) ? track.data : [];
    const pairs = [];
    let cumulativeUnits = 0;
    let previousBrightness = 0;

    for (let index = 0; index + 1 < data.length; index += 2) {
      const durationUnits = Number(data[index]);
      const targetBrightness = Number(data[index + 1]);
      const startUnits = cumulativeUnits;
      cumulativeUnits += durationUnits;
      const direction = targetBrightness === previousBrightness
        ? "hold"
        : targetBrightness > previousBrightness
          ? "up"
          : "down";
      pairs.push({
        index: pairs.length,
        durationUnits,
        durationMs: durationUnits * 10,
        startUnits,
        startMs: startUnits * 10,
        cumulativeUnits,
        cumulativeMs: cumulativeUnits * 10,
        startBrightness: previousBrightness,
        targetBrightness,
        direction,
      });
      previousBrightness = targetBrightness;
    }

    return {
      identifier: Number(track?.identifier),
      pairCount: pairs.length,
      durationUnits: cumulativeUnits,
      durationMs: cumulativeUnits * 10,
      finalBrightness: previousBrightness,
      pairs,
    };
  }

  function encodeTrack(track) {
    const identifier = Number(track?.identifier);
    const points = Array.isArray(track?.points) ? track.points.slice(1) : [];
    const errors = [];
    const data = [];

    if (!Number.isInteger(identifier) || identifier < 1 || identifier > 255) {
      return { bytes: [], data, errors: ["曲线包含无效通道 ID"] };
    }
    if (!points.length) {
      return { bytes: [], data, errors: [`通道 ${hexByte(identifier)} 没有可编码节点`] };
    }

    let previousTime = 0;
    let previousBrightness = 0;
    points.forEach((point, pointIndex) => {
      const targetTime = Math.round(Number(point.time) / 10) * 10;
      const targetBrightness = Math.max(0, Math.min(100, Math.round(Number(point.brightness))));
      if (!Number.isFinite(targetTime) || !Number.isFinite(targetBrightness)) {
        errors.push(`通道 ${hexByte(identifier)} 第 ${pointIndex + 1} 个节点无效`);
        return;
      }
      if (targetTime < previousTime) {
        errors.push(`通道 ${hexByte(identifier)} 的节点时间顺序无效`);
        return;
      }

      const durationUnits = Math.round((targetTime - previousTime) / 10);
      if (durationUnits === 0) {
        data.push(0, targetBrightness);
      } else {
        let consumedUnits = 0;
        while (consumedUnits < durationUnits) {
          const chunkUnits = Math.min(255, durationUnits - consumedUnits);
          consumedUnits += chunkUnits;
          const progress = consumedUnits / durationUnits;
          const chunkBrightness = Math.round(
            previousBrightness + (targetBrightness - previousBrightness) * progress,
          );
          data.push(chunkUnits, chunkBrightness);
        }
      }
      previousTime = targetTime;
      previousBrightness = targetBrightness;
    });

    const pairCount = data.length / 2;
    if (pairCount > 0xffff) {
      errors.push(`通道 ${hexByte(identifier)} 的节点过多，无法写入两字节长度字段`);
    }
    if (errors.length) return { bytes: [], data, errors };

    return {
      bytes: [identifier, pairCount >> 8, pairCount & 0xff, ...data],
      data,
      errors: [],
    };
  }

  function encodeSide(side, sideLabel) {
    const bytes = [];
    const errors = [];
    const tracks = Array.isArray(side?.tracks) ? side.tracks : [];

    tracks.forEach((track) => {
      const encoded = encodeTrack(track);
      bytes.push(...encoded.bytes);
      errors.push(...encoded.errors.map((error) => `${sideLabel}：${error}`));
    });
    bytes.push(0, 0, 0);

    const capacity = LIMITS.staging1 + LIMITS.staging2;
    const usedBytes = bytes.length;
    if (bytes.length > capacity) {
      errors.push(`${sideLabel}：编码后为 ${bytes.length} Byte，超过 ${capacity} Byte 总容量`);
    } else {
      while (bytes.length < capacity) bytes.push(0);
    }
    return { bytes, usedBytes, errors };
  }

  function encodeProject(analysis) {
    const left = encodeSide(analysis?.left, "左侧 FLM2 [43]");
    const right = encodeSide(analysis?.right, "右侧 FLM2 [44]");
    return {
      left,
      right,
      errors: [...left.errors, ...right.errors],
      valid: left.errors.length === 0 && right.errors.length === 0,
    };
  }

  function brightnessAt(track, time) {
    if (!track || !track.points.length || time < 0) return 0;

    let previous = track.points[0];
    for (let index = 1; index < track.points.length; index += 1) {
      const current = track.points[index];
      if (time <= current.time) {
        const span = current.time - previous.time;
        if (span <= 0) return current.brightness;
        const progress = Math.max(0, Math.min(1, (time - previous.time) / span));
        return previous.brightness + (current.brightness - previous.brightness) * progress;
      }
      previous = current;
    }

    return previous.brightness;
  }

  function trackById(side, identifier) {
    return side.tracks.find((track) => track.identifier === identifier) || null;
  }

  function composeG20PreLci(side, time) {
    const raw = {};
    for (let identifier = 0x01; identifier <= 0x05; identifier += 1) {
      raw[identifier] = brightnessAt(trackById(side, identifier), time);
    }

    const drl = Math.max(raw[0x02], raw[0x03]);
    const lowContributions = {
      0x01: raw[0x01] * G20_PRELCI_PROFILE.lowGain[0x01],
      0x04: raw[0x04] * G20_PRELCI_PROFILE.lowGain[0x04],
      0x05: raw[0x05] * G20_PRELCI_PROFILE.lowGain[0x05],
    };
    const low = Math.max(...Object.values(lowContributions));

    return {
      drl,
      low,
      laser: 0,
      turnSignal: 0,
      raw,
      lowContributions,
    };
  }

  function extractTemplate(text) {
    const source = String(text || "");
    const errors = [];

    function sideBlock(side, address) {
      const nextSide = side === "Left" ? "(?=FLM2\\s+Right|$)" : "$";
      const expression = new RegExp(
        `FLM2\\s+${side}\\s*\\[(?:0x)?${address}\\]([\\s\\S]*?)${nextSide}`,
        "i",
      );
      return source.match(expression)?.[1] || "";
    }

    function staging(block, number) {
      const next = number === 1 ? "(?=Staging2_Data\\s*:)" : "$";
      const expression = new RegExp(`Staging${number}_Data\\s*:\\s*([\\s\\S]*?)${next}`, "i");
      return block.match(expression)?.[1]?.trim() || "";
    }

    const leftBlock = sideBlock("Left", "43");
    const rightBlock = sideBlock("Right", "44");
    if (!leftBlock) errors.push("没有找到 FLM2 Left [43] 区块");
    if (!rightBlock) errors.push("没有找到 FLM2 Right [44] 区块");

    const fields = {
      left1: staging(leftBlock, 1),
      left2: staging(leftBlock, 2),
      right1: staging(rightBlock, 1),
      right2: staging(rightBlock, 2),
    };

    if (leftBlock && !fields.left1) errors.push("左侧缺少 Staging1_Data");
    if (rightBlock && !fields.right1) errors.push("右侧缺少 Staging1_Data");
    return { fields, errors };
  }

  const api = {
    CHANNELS,
    G20_PRELCI_PROFILE,
    LIMITS,
    brightnessAt,
    composeG20PreLci,
    describeTrack,
    encodeProject,
    encodeTrack,
    extractTemplate,
    hexByte,
    parseByteString,
    parseProject,
    parseSequences,
    trackById,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.WelcomeLightCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
