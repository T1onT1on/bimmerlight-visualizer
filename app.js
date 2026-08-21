(function startLightStudio() {
  "use strict";

  const Core = globalThis.WelcomeLightCore;
  const Samples = globalThis.WelcomeLightSamples;
  const Backup = globalThis.BimmerCodeBackup;
  const canvas = document.getElementById("visualizerCanvas");
  const context = canvas.getContext("2d");
  const curveCanvas = document.getElementById("curveCanvas");
  const curveContext = curveCanvas.getContext("2d");

  const elements = {
    templateInput: document.getElementById("templateInput"),
    pasteTarget: document.getElementById("pasteTarget"),
    pasteModeBtn: document.getElementById("pasteModeBtn"),
    byteModeBtn: document.getElementById("byteModeBtn"),
    humanModeBtn: document.getElementById("humanModeBtn"),
    pasteModePanel: document.getElementById("pasteModePanel"),
    byteModePanel: document.getElementById("byteModePanel"),
    humanModePanel: document.getElementById("humanModePanel"),
    byteLeftBtn: document.getElementById("byteLeftBtn"),
    byteRightBtn: document.getElementById("byteRightBtn"),
    byteSideLeft: document.getElementById("byteSideLeft"),
    byteSideRight: document.getElementById("byteSideRight"),
    byteSectionsLeft: document.getElementById("byteSectionsLeft"),
    byteSectionsRight: document.getElementById("byteSectionsRight"),
    humanLeftBtn: document.getElementById("humanLeftBtn"),
    humanRightBtn: document.getElementById("humanRightBtn"),
    humanSideLeft: document.getElementById("humanSideLeft"),
    humanSideRight: document.getElementById("humanSideRight"),
    humanSectionsLeft: document.getElementById("humanSectionsLeft"),
    humanSectionsRight: document.getElementById("humanSectionsRight"),
    refreshHumanBtn: document.getElementById("refreshHumanBtn"),
    applyHumanBtn: document.getElementById("applyHumanBtn"),
    splitTemplateBtn: document.getElementById("splitTemplateBtn"),
    loadOriginalBtn: document.getElementById("loadOriginalBtn"),
    loadV15Btn: document.getElementById("loadV15Btn"),
    loadDoubleSwipeFlashBtn: document.getElementById("loadDoubleSwipeFlashBtn"),
    parseBtn: document.getElementById("parseBtn"),
    clearBtn: document.getElementById("clearBtn"),
    left1: document.getElementById("left1"),
    left2: document.getElementById("left2"),
    right1: document.getElementById("right1"),
    right2: document.getElementById("right2"),
    mirrorLeft: document.getElementById("mirrorLeft"),
    parseMessage: document.getElementById("parseMessage"),
    durationMetric: document.getElementById("durationMetric"),
    channelMetric: document.getElementById("channelMetric"),
    sequenceMetric: document.getElementById("sequenceMetric"),
    curvePanel: document.getElementById("curvePanel"),
    curveChannelButtons: [...document.querySelectorAll(".curve-channel-button")],
    viewRightBtn: document.getElementById("viewRightBtn"),
    viewLeftBtn: document.getElementById("viewLeftBtn"),
    viewBothBtn: document.getElementById("viewBothBtn"),
    editCurveBtn: document.getElementById("editCurveBtn"),
    curveEditorPanel: document.getElementById("curveEditorPanel"),
    curveEditStatus: document.getElementById("curveEditStatus"),
    applyCurveBtn: document.getElementById("applyCurveBtn"),
    saveCurveBtn: document.getElementById("saveCurveBtn"),
    loadCurveBtn: document.getElementById("loadCurveBtn"),
    cancelCurveBtn: document.getElementById("cancelCurveBtn"),
    pointTimeInput: document.getElementById("pointTimeInput"),
    pointBrightnessInput: document.getElementById("pointBrightnessInput"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomFitBtn: document.getElementById("zoomFitBtn"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    curvePan: document.getElementById("curvePan"),
    curveContextMenu: document.getElementById("curveContextMenu"),
    curveContextLabel: document.getElementById("curveContextLabel"),
    addCurvePointBtn: document.getElementById("addCurvePointBtn"),
    deleteCurvePointBtn: document.getElementById("deleteCurvePointBtn"),
    curveSideLegend: document.getElementById("curveSideLegend"),
    playBtn: document.getElementById("playBtn"),
    currentTime: document.getElementById("currentTime"),
    totalTime: document.getElementById("totalTime"),
    timeline: document.getElementById("timeline"),
    speedSelect: document.getElementById("speedSelect"),
    loopToggle: document.getElementById("loopToggle"),
    channelList: document.getElementById("channelList"),
    warningList: document.getElementById("warningList"),
    bimmerCodeFileInput: document.getElementById("bimmerCodeFileInput"),
    bimmerCodeResetBtn: document.getElementById("bimmerCodeResetBtn"),
    bimmerCodeExportBtn: document.getElementById("bimmerCodeExportBtn"),
    bimmerCodeStatus: document.getElementById("bimmerCodeStatus"),
    bimmerCodeLeftCard: document.getElementById("bimmerCodeLeftCard"),
    bimmerCodeLeftName: document.getElementById("bimmerCodeLeftName"),
    bimmerCodeLeftIdentifier: document.getElementById("bimmerCodeLeftIdentifier"),
    bimmerCodeLeftVin: document.getElementById("bimmerCodeLeftVin"),
    bimmerCodeLeftCafd: document.getElementById("bimmerCodeLeftCafd"),
    bimmerCodeRightCard: document.getElementById("bimmerCodeRightCard"),
    bimmerCodeRightName: document.getElementById("bimmerCodeRightName"),
    bimmerCodeRightIdentifier: document.getElementById("bimmerCodeRightIdentifier"),
    bimmerCodeRightVin: document.getElementById("bimmerCodeRightVin"),
    bimmerCodeRightCafd: document.getElementById("bimmerCodeRightCafd"),
    pngBtn: document.getElementById("pngBtn"),
    webmBtn: document.getElementById("webmBtn"),
    exportStatus: document.getElementById("exportStatus"),
    leftDrlOutput: document.getElementById("leftDrlOutput"),
    leftLowOutput: document.getElementById("leftLowOutput"),
    rightDrlOutput: document.getElementById("rightDrlOutput"),
    rightLowOutput: document.getElementById("rightLowOutput"),
  };

  const state = {
    analysis: null,
    currentTime: 0,
    speed: 1,
    playing: false,
    recording: false,
    lastFrame: performance.now(),
    laneRefs: new Map(),
    inputMode: "paste",
    inputSource: "paste",
    byteSide: "left",
    humanSide: "left",
    humanDraft: { left: [], right: [] },
    humanDirty: false,
    curveView: "both",
    visibleChannels: new Set([1, 2, 3, 4, 5]),
    curveEditor: {
      active: false,
      originalAnalysis: null,
      originalFields: null,
      selected: null,
      dragging: null,
      axisDuration: 0,
      zoom: 1,
      viewStart: 0,
      contextTarget: null,
    },
    byteInputs: {
      left1: [],
      left2: [],
      right1: [],
      right2: [],
    },
    bimmerCode: {
      left: null,
      right: null,
      busy: false,
    },
  };

  const CURVE_MARGIN = { top: 28, right: 28, bottom: 62, left: 78 };
  const CURVE_ZOOM_LEVELS = [1, 2, 4, 8, 16];
  const SAVED_CURVE_KEY = "flm-light-studio.saved-curve.v1";

  const BYTE_GRID_CONFIG = [
    { key: "left1", side: "left", stage: 1, count: Core.LIMITS.staging1, offset: 0 },
    { key: "left2", side: "left", stage: 2, count: Core.LIMITS.staging2, offset: Core.LIMITS.staging1 },
    { key: "right1", side: "right", stage: 1, count: Core.LIMITS.staging1, offset: 0 },
    { key: "right2", side: "right", stage: 2, count: Core.LIMITS.staging2, offset: Core.LIMITS.staging1 },
  ];

  const headlightAsset = {
    ready: false,
    error: "",
    background: null,
    layers: new Map(),
  };

  const svgLayerOrder = [
    { id: "channel-03", identifier: 0x03, color: "#fffd07" },
    { id: "channel-01", identifier: 0x01, color: "#a8efff" },
    { id: "channel-04", identifier: 0x04, color: "#2469ff" },
    { id: "channel-05", identifier: 0x05, color: "#c67aff" },
    { id: "channel-02", identifier: 0x02, color: "#ff8a47" },
  ];

  function isolateCompositeLayer(sourceDocument, targetId) {
    const documentNode = sourceDocument.cloneNode(true);
    const root = documentNode.documentElement;

    [...root.children].forEach((child) => {
      const isBackground = child.id === "vehicle-background";
      const isHeadlight = child.id === "headlight-left" || child.id === "headlight-right";
      if (!isBackground && !isHeadlight) return;

      if (targetId === "vehicle-background") {
        if (!isBackground) child.remove();
        return;
      }

      const targetSide = targetId.startsWith("left-") ? "left" : "right";
      if (child.id !== `headlight-${targetSide}`) {
        child.remove();
        return;
      }

      [...child.children].forEach((layer) => {
        if (layer.id !== targetId) layer.remove();
      });
    });
    return new XMLSerializer().serializeToString(documentNode);
  }

  function loadSvgImage(source) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
      const image = new Image();
      image.decoding = "async";
      image.addEventListener("load", () => {
        URL.revokeObjectURL(url);
        resolve(image);
      }, { once: true });
      image.addEventListener("error", () => {
        URL.revokeObjectURL(url);
        reject(new Error("SVG 图层无法解码"));
      }, { once: true });
      image.src = url;
    });
  }

  async function loadHeadlightAsset() {
    try {
      const response = await fetch("assets/G20PreLCIBase.svg");
      if (!response.ok) throw new Error(`SVG 请求失败 (${response.status})`);
      const source = await response.text();
      const sourceDocument = new DOMParser().parseFromString(source, "image/svg+xml");
      const layerIds = [
        "vehicle-background",
        ...["left", "right"].flatMap((side) => [
          `${side}-housing`,
          ...svgLayerOrder.map((layer) => `${side}-${layer.id}`),
        ]),
      ];
      const images = await Promise.all(
        layerIds.map(async (layerId) => [
          layerId,
          await loadSvgImage(isolateCompositeLayer(sourceDocument, layerId)),
        ]),
      );
      const imageMap = new Map(images);
      headlightAsset.background = imageMap.get("vehicle-background");
      imageMap.delete("vehicle-background");
      headlightAsset.layers = imageMap;
      headlightAsset.ready = true;
      headlightAsset.error = "";
    } catch (error) {
      headlightAsset.ready = false;
      headlightAsset.error = error instanceof Error ? error.message : "SVG 载入失败";
    }
    renderScene();
  }

  function setMessage(message, type = "") {
    elements.parseMessage.textContent = message;
    elements.parseMessage.className = `parse-message${type ? ` is-${type}` : ""}`;
  }

  function initializeByteInputs() {
    BYTE_GRID_CONFIG.forEach((config) => {
      for (let index = 0; index < config.count; index += 1) {
        const globalIndex = config.offset + index;
        const cell = document.createElement("label");
        cell.className = "byte-cell";

        const number = document.createElement("span");
        number.textContent = String(globalIndex + 1).padStart(3, "0");

        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "text";
        input.maxLength = 4;
        input.autocomplete = "off";
        input.spellcheck = false;
        input.placeholder = "00";
        input.dataset.side = config.side;
        input.dataset.stage = String(config.stage);
        input.dataset.globalIndex = String(globalIndex);
        input.setAttribute(
          "aria-label",
          `车辆${config.side === "left" ? "左" : "右"} Byte ${String(globalIndex + 1).padStart(3, "0")}`,
        );

        cell.append(number, input);
        input._byteCell = cell;
        state.byteInputs[config.key].push(input);
      }
    });
    renderByteChannelSections();
  }

  function sideByteInputs(side) {
    return [...state.byteInputs[`${side}1`], ...state.byteInputs[`${side}2`]];
  }

  function byteRangeLabel(start, end) {
    if (start > end) return "未分配字节";
    const formatRange = (from, to) => `${String(from + 1).padStart(3, "0")}–${String(to + 1).padStart(3, "0")}`;
    if (end < Core.LIMITS.staging1) return `STAGING1 · ${formatRange(start, end)}`;
    if (start >= Core.LIMITS.staging1) return `STAGING2 · ${formatRange(start, end)}`;
    return `STAGING1 ${formatRange(start, Core.LIMITS.staging1 - 1)} · STAGING2 ${formatRange(Core.LIMITS.staging1, end)}`;
  }

  function inspectByteLayout(inputs) {
    const bytes = inputs.map((input) => {
      const normalized = normalizeByteValue(input.value, true);
      return normalized.valid ? parseInt(normalized.hex, 16) : 0;
    });
    const blocks = [];
    let offset = 0;
    let terminator = null;
    let invalidOffset = null;

    while (offset + 2 < bytes.length) {
      if (bytes[offset] === 0 && bytes[offset + 1] === 0 && bytes[offset + 2] === 0) {
        terminator = { start: offset, end: offset + 2 };
        offset += 3;
        break;
      }
      const identifier = bytes[offset];
      const pairCount = (bytes[offset + 1] << 8) | bytes[offset + 2];
      const end = offset + 3 + pairCount * 2;
      if (!identifier || !pairCount || end > bytes.length) {
        invalidOffset = offset;
        break;
      }
      blocks.push({ identifier, pairCount, start: offset, end: end - 1 });
      offset = end;
    }

    return {
      blocks,
      terminator,
      remainderStart: terminator ? offset : (invalidOffset ?? offset),
      invalidOffset,
    };
  }

  function createByteSection({
    title,
    subtitle,
    tone = "",
    inputs = [],
    headerCount = 0,
    placeholder = "",
    pairControls = null,
  }) {
    const section = document.createElement("section");
    section.className = `byte-channel-card${tone ? ` ${tone}` : ""}`;
    const heading = document.createElement("div");
    heading.className = "byte-channel-heading";
    heading.innerHTML = `<div><h3>${title}</h3><p>${subtitle}</p></div><span>${inputs.length} BYTE</span>`;
    section.appendChild(heading);

    if (inputs.length) {
      const grid = document.createElement("div");
      grid.className = "byte-grid byte-channel-grid";
      inputs.forEach((input, index) => {
        input._byteCell.classList.toggle("is-header", index < headerCount);
        grid.appendChild(input._byteCell);
      });
      if (pairControls) {
        const controls = document.createElement("div");
        controls.className = "byte-pair-controls";
        controls.innerHTML = `
          <button class="byte-pair-button is-remove" type="button" data-byte-action="remove-pair" data-side="${pairControls.side}" data-channel="${pairControls.identifier}" ${pairControls.pairCount <= 1 ? "disabled" : ""}>
            <b>−</b><span>删除末组</span>
          </button>
          <button class="byte-pair-button is-add" type="button" data-byte-action="add-pair" data-side="${pairControls.side}" data-channel="${pairControls.identifier}">
            <b>+</b><span>添加 1 组</span>
          </button>
        `;
        grid.appendChild(controls);
      }
      section.appendChild(grid);
    } else {
      const empty = document.createElement("p");
      empty.className = "byte-channel-empty";
      empty.textContent = placeholder;
      section.appendChild(empty);
    }
    return section;
  }

  function renderByteChannelSections() {
    ["left", "right"].forEach((side) => {
      const inputs = sideByteInputs(side);
      const container = side === "left" ? elements.byteSectionsLeft : elements.byteSectionsRight;
      const layout = inspectByteLayout(inputs);
      const assignedIndices = new Set();
      const fragment = document.createDocumentFragment();

      for (let identifier = 1; identifier <= 6; identifier += 1) {
        const channelBlocks = layout.blocks.filter((block) => block.identifier === identifier);
        const block = channelBlocks[0];
        const channel = Core.CHANNELS[identifier];
        const label = `CH${Core.hexByte(identifier)}`;
        const blockInputs = channelBlocks.flatMap((item) => {
          for (let index = item.start; index <= item.end; index += 1) assignedIndices.add(index);
          return inputs.slice(item.start, item.end + 1);
        });
        fragment.appendChild(createByteSection({
          title: `${label}${channel ? ` · ${channel.name}` : " · 预留通道"}`,
          subtitle: block
            ? `当前 ${channelBlocks.reduce((total, item) => total + item.pairCount, 0)} 组时间/亮度 · ${channelBlocks.map((item) => byteRangeLabel(item.start, item.end)).join(" · ")}`
            : "当前数据未声明此通道",
          tone: `is-channel-${Core.hexByte(identifier)}${block ? "" : " is-inactive"}`,
          inputs: blockInputs,
          headerCount: 3,
          pairControls: channelBlocks.length === 1 ? {
            side,
            identifier,
            pairCount: block?.pairCount || 0,
          } : null,
          placeholder: identifier === 6
            ? "CH06 仅作为结构占位，不会自动写入 06, 00, 00。"
            : "此通道未出现在当前序列中。",
        }));
      }

      layout.blocks.filter((block) => block.identifier > 6).forEach((block) => {
        for (let index = block.start; index <= block.end; index += 1) assignedIndices.add(index);
        fragment.appendChild(createByteSection({
          title: `CH${Core.hexByte(block.identifier)} · 未映射通道`,
          subtitle: `${block.pairCount} 组时间/亮度 · ${byteRangeLabel(block.start, block.end)}`,
          tone: "is-unresolved",
          inputs: inputs.slice(block.start, block.end + 1),
          headerCount: 3,
          pairControls: {
            side,
            identifier: block.identifier,
            pairCount: block.pairCount,
          },
        }));
      });

      if (layout.terminator) {
        for (let index = layout.terminator.start; index <= layout.terminator.end; index += 1) assignedIndices.add(index);
        fragment.appendChild(createByteSection({
          title: "END · 序列终止标记",
          subtitle: byteRangeLabel(layout.terminator.start, layout.terminator.end),
          tone: "is-terminator",
          inputs: inputs.slice(layout.terminator.start, layout.terminator.end + 1),
          headerCount: 3,
        }));
      }

      const remainder = inputs.filter((_, index) => !assignedIndices.has(index));
      const remainderIndices = inputs
        .map((_, index) => index)
        .filter((index) => !assignedIndices.has(index));
      const remainderStart = remainderIndices[0] ?? inputs.length;
      const remainderEnd = remainderIndices[remainderIndices.length - 1] ?? inputs.length - 1;
      fragment.appendChild(createByteSection({
        title: layout.invalidOffset === null ? "UNUSED CAPACITY · 未使用容量" : "UNRESOLVED · 结构待确认",
        subtitle: byteRangeLabel(remainderStart, remainderEnd),
        tone: layout.invalidOffset === null ? "is-unused" : "is-unresolved",
        inputs: remainder,
        placeholder: "没有剩余字节。",
      }));

      container.replaceChildren(fragment);
    });
  }

  function readSideByteValues(side) {
    const inputs = sideByteInputs(side);
    const bytes = [];
    const errors = [];
    inputs.forEach((input, index) => {
      const normalized = normalizeByteValue(input.value, true);
      input.classList.toggle("is-invalid", !normalized.valid);
      if (!normalized.valid) {
        errors.push(`Byte ${String(index + 1).padStart(3, "0")} 的值“${input.value}”无效`);
        return;
      }
      bytes.push(parseInt(normalized.hex, 16));
    });
    return { inputs, bytes, errors };
  }

  function writeSideByteValues(inputs, bytes) {
    inputs.forEach((input, index) => {
      input.value = Core.hexByte(bytes[index] || 0);
      input.classList.remove("is-invalid");
    });
  }

  function adjustChannelPairCount(side, identifier, delta) {
    const sideLabel = side === "left" ? "车辆左 [43]" : "车辆右 [44]";
    const { inputs, bytes, errors } = readSideByteValues(side);
    if (errors.length) {
      setMessage(`${sideLabel}：${errors.slice(0, 4).join("；")}`, "error");
      return;
    }
    const layout = inspectByteLayout(inputs);
    const blocks = layout.blocks.filter((block) => block.identifier === identifier);
    if (layout.invalidOffset !== null || !layout.terminator || blocks.length !== 1) {
      setMessage(`${sideLabel} CH${Core.hexByte(identifier)}：当前结构无法安全调整`, "error");
      return;
    }

    const block = blocks[0];
    const nextPairCount = block.pairCount + delta;
    if (nextPairCount < 1 || nextPairCount > 0xffff) {
      setMessage(`${sideLabel} CH${Core.hexByte(identifier)}：至少保留 1 组，最多 65535 组`, "error");
      return;
    }
    if (delta > 0 && layout.terminator.end + 1 + 2 > bytes.length) {
      setMessage(`${sideLabel}：420 Byte 容量不足，无法继续添加`, "error");
      return;
    }

    let focusIndex;
    if (delta > 0) {
      const lastBrightness = bytes[block.end];
      focusIndex = block.end + 1;
      bytes.splice(focusIndex, 0, 0, lastBrightness);
      bytes.length = inputs.length;
    } else {
      focusIndex = Math.max(block.start + 3, block.end - 3);
      bytes.splice(block.end - 1, 2);
      while (bytes.length < inputs.length) bytes.push(0);
    }

    bytes[block.start + 1] = (nextPairCount >> 8) & 0xff;
    bytes[block.start + 2] = nextPairCount & 0xff;
    writeSideByteValues(inputs, bytes);
    state.inputSource = "bytes";
    renderByteChannelSections();
    inputs[focusIndex]?.focus();
    setMessage(
      `${sideLabel} CH${Core.hexByte(identifier)} 已${delta > 0 ? "添加" : "删除"} 1 组；当前 ${nextPairCount} 组，后续数据已移动 ${Math.abs(delta) * 2} Byte`,
      "success",
    );
  }

  function handleByteStructureClick(event) {
    const button = event.target.closest("[data-byte-action]");
    if (!button) return;
    const delta = button.dataset.byteAction === "add-pair" ? 1 : -1;
    adjustChannelPairCount(button.dataset.side, Number(button.dataset.channel), delta);
  }

  function humanDraftFromAnalysis(analysis) {
    const convertSide = (side) => side.tracks.map((track) => {
      const readable = Core.describeTrack(track);
      return {
        identifier: readable.identifier,
        pairs: readable.pairs.map((pair) => ({
          durationUnits: pair.durationUnits,
          targetBrightness: pair.targetBrightness,
        })),
      };
    });
    return {
      left: convertSide(analysis.left),
      right: convertSide(analysis.right),
    };
  }

  function humanAnalysisFromDraft() {
    const convertSide = (tracks) => ({
      tracks: tracks
        .filter((track) => track.pairs.length)
        .map((track) => {
          let time = 0;
          const points = [{ time: 0, brightness: 0 }];
          track.pairs.forEach((pair) => {
            time += pair.durationUnits * 10;
            points.push({ time, brightness: pair.targetBrightness });
          });
          return { identifier: track.identifier, points };
        }),
    });
    return {
      left: convertSide(state.humanDraft.left),
      right: convertSide(state.humanDraft.right),
    };
  }

  function humanSideLabel(side) {
    return side === "left" ? "车辆左 [43]" : "车辆右 [44]";
  }

  function formatHumanTime(milliseconds) {
    if (milliseconds < 1000) return `${milliseconds}ms`;
    return `${(milliseconds / 1000).toFixed(2)}s`;
  }

  function humanTransitionLabel(startBrightness, targetBrightness) {
    if (targetBrightness === startBrightness) return `保持 ${targetBrightness}%`;
    return `${targetBrightness > startBrightness ? "渐亮" : "渐暗"} ${startBrightness}% → ${targetBrightness}%`;
  }

  function humanTrack(side, identifier) {
    return state.humanDraft[side].find((track) => track.identifier === identifier) || null;
  }

  function renderHumanSide(side) {
    const container = side === "left" ? elements.humanSectionsLeft : elements.humanSectionsRight;
    const trackMap = new Map(state.humanDraft[side].map((track) => [track.identifier, track]));
    const identifiers = [...new Set([1, 2, 3, 4, 5, 6, ...trackMap.keys()])].sort((a, b) => a - b);
    const fragment = document.createDocumentFragment();

    identifiers.forEach((identifier) => {
      const track = trackMap.get(identifier) || null;
      const channel = Core.CHANNELS[identifier];
      const section = document.createElement("section");
      section.className = `human-channel-card is-channel-${Core.hexByte(identifier)}${track ? "" : " is-inactive"}`;
      section.dataset.side = side;
      section.dataset.channel = String(identifier);

      let totalUnits = 0;
      let previousBrightness = 0;
      const rows = (track?.pairs || []).map((pair, index) => {
        const startUnits = totalUnits;
        totalUnits += pair.durationUnits;
        const transition = humanTransitionLabel(previousBrightness, pair.targetBrightness);
        previousBrightness = pair.targetBrightness;
        return `
          <div class="human-pair-row" data-pair-index="${index}">
            <span class="human-pair-index">#${String(index + 1).padStart(2, "0")}</span>
            <label class="human-pair-field">
              <span>时长 ×10ms</span>
              <input class="human-duration-input" type="number" inputmode="numeric" min="0" max="255" step="1" value="${pair.durationUnits}" aria-label="CH${Core.hexByte(identifier)} 第 ${index + 1} 组时长，单位10ms">
            </label>
            <output class="human-duration-readout">${formatHumanTime(pair.durationUnits * 10)}</output>
            <label class="human-pair-field">
              <span>目标亮度</span>
              <input class="human-brightness-input" type="number" inputmode="numeric" min="0" max="100" step="1" value="${pair.targetBrightness}" aria-label="CH${Core.hexByte(identifier)} 第 ${index + 1} 组目标亮度百分比">
            </label>
            <output class="human-cumulative-readout">${formatHumanTime(startUnits * 10)} → ${formatHumanTime(totalUnits * 10)}</output>
            <output class="human-transition-readout">${transition}</output>
            <button class="human-row-remove" type="button" data-human-action="remove-pair" aria-label="${track.pairs.length <= 1 ? "移除整个" : "删除"} CH${Core.hexByte(identifier)} 第 ${index + 1} 组">${track.pairs.length <= 1 ? "移除" : "删除"}</button>
          </div>
        `;
      }).join("");

      const finalBrightness = track?.pairs.at(-1)?.targetBrightness ?? 0;
      const channelName = channel?.name || (identifier === 6 ? "预留通道" : "未映射通道");
      section.innerHTML = `
        <div class="human-channel-heading">
          <div>
            <h3>CH${Core.hexByte(identifier)} · ${channelName}</h3>
            <p>${track ? `当前 ${track.pairs.length} 组 · 每组写入时间/亮度 2 Byte` : "当前代码未声明此通道"}</p>
          </div>
          <span class="human-channel-total">${track ? `${track.pairs.length} GROUP · ${formatHumanTime(totalUnits * 10)}` : "INACTIVE"}</span>
        </div>
        ${track ? `
          <div class="human-pair-column-head" aria-hidden="true">
            <span>组</span><span>时长输入</span><span>实际时长</span><span>亮度输入</span><span>累计时间</span><span>灯光行为</span><span></span>
          </div>
          <div class="human-pair-list">${rows}</div>
        ` : `<p class="human-channel-empty">添加第一组后，CH${Core.hexByte(identifier)} 才会写入序列。</p>`}
        <div class="human-pair-composer">
          <strong>${track ? "在末尾添加控制点" : "创建通道并添加第一组"}</strong>
          <label><span>时长 ×10ms</span><input class="human-new-duration" type="number" inputmode="numeric" min="0" max="255" step="1" value="50"></label>
          <label><span>目标亮度 %</span><input class="human-new-brightness" type="number" inputmode="numeric" min="0" max="100" step="1" value="${finalBrightness}"></label>
          <button class="human-add-button" type="button" data-human-action="add-pair">+ 添加数据</button>
        </div>
      `;
      fragment.appendChild(section);
    });

    container.replaceChildren(fragment);
  }

  function renderHumanReadable() {
    renderHumanSide("left");
    renderHumanSide("right");
  }

  function setHumanSide(side) {
    state.humanSide = side;
    const isLeft = side === "left";
    elements.humanSideLeft.hidden = !isLeft;
    elements.humanSideRight.hidden = isLeft;
    elements.humanLeftBtn.classList.toggle("is-active", isLeft);
    elements.humanRightBtn.classList.toggle("is-active", !isLeft);
    elements.humanLeftBtn.setAttribute("aria-selected", String(isLeft));
    elements.humanRightBtn.setAttribute("aria-selected", String(!isLeft));
  }

  function readHumanInteger(input, minimum, maximum) {
    const value = Number(input.value);
    const valid = input.value.trim() !== ""
      && Number.isInteger(value)
      && value >= minimum
      && value <= maximum;
    input.classList.toggle("is-invalid", !valid);
    return valid ? value : null;
  }

  function updateHumanCardSummaries(side, identifier) {
    const container = side === "left" ? elements.humanSectionsLeft : elements.humanSectionsRight;
    const card = container.querySelector(`.human-channel-card[data-channel="${identifier}"]`);
    const track = humanTrack(side, identifier);
    if (!card || !track) return;

    let totalUnits = 0;
    let previousBrightness = 0;
    card.querySelectorAll(".human-pair-row").forEach((row, index) => {
      const pair = track.pairs[index];
      const startUnits = totalUnits;
      totalUnits += pair.durationUnits;
      row.querySelector(".human-duration-readout").textContent = formatHumanTime(pair.durationUnits * 10);
      row.querySelector(".human-cumulative-readout").textContent = `${formatHumanTime(startUnits * 10)} → ${formatHumanTime(totalUnits * 10)}`;
      row.querySelector(".human-transition-readout").textContent = humanTransitionLabel(previousBrightness, pair.targetBrightness);
      previousBrightness = pair.targetBrightness;
    });
    card.querySelector(".human-channel-total").textContent = `${track.pairs.length} GROUP · ${formatHumanTime(totalUnits * 10)}`;
  }

  function handleHumanInput(event) {
    const input = event.target.closest(".human-duration-input, .human-brightness-input");
    if (!input) return;
    const card = input.closest(".human-channel-card");
    const row = input.closest(".human-pair-row");
    const side = card.dataset.side;
    const identifier = Number(card.dataset.channel);
    const pair = humanTrack(side, identifier)?.pairs[Number(row.dataset.pairIndex)];
    if (!pair) return;

    const isDuration = input.classList.contains("human-duration-input");
    const value = readHumanInteger(input, 0, isDuration ? 255 : 100);
    if (value === null) return;
    if (isDuration) pair.durationUnits = value;
    else pair.targetBrightness = value;
    state.humanDirty = true;
    state.inputSource = "human";
    updateHumanCardSummaries(side, identifier);
  }

  function handleHumanClick(event) {
    const button = event.target.closest("[data-human-action]");
    if (!button) return;
    const card = button.closest(".human-channel-card");
    const side = card.dataset.side;
    const identifier = Number(card.dataset.channel);
    const action = button.dataset.humanAction;

    if (action === "add-pair") {
      const durationInput = card.querySelector(".human-new-duration");
      const brightnessInput = card.querySelector(".human-new-brightness");
      const durationUnits = readHumanInteger(durationInput, 0, 255);
      const targetBrightness = readHumanInteger(brightnessInput, 0, 100);
      if (durationUnits === null || targetBrightness === null) {
        setMessage("添加失败：时长必须为 0–255 的整数，亮度必须为 0–100 的整数", "error");
        return;
      }
      let track = humanTrack(side, identifier);
      if (!track) {
        track = { identifier, pairs: [] };
        state.humanDraft[side].push(track);
        state.humanDraft[side].sort((a, b) => a.identifier - b.identifier);
      }
      track.pairs.push({ durationUnits, targetBrightness });
      state.humanDirty = true;
      state.inputSource = "human";
      renderHumanSide(side);
      const nextCard = (side === "left" ? elements.humanSectionsLeft : elements.humanSectionsRight)
        .querySelector(`.human-channel-card[data-channel="${identifier}"]`);
      nextCard?.querySelector(".human-new-duration")?.focus();
      setMessage(`${humanSideLabel(side)} CH${Core.hexByte(identifier)} 已添加第 ${track.pairs.length} 组`, "success");
      return;
    }

    if (action === "remove-pair") {
      const track = humanTrack(side, identifier);
      const row = button.closest(".human-pair-row");
      const pairIndex = Number(row.dataset.pairIndex);
      if (!track) return;
      const removedEntireChannel = track.pairs.length === 1;
      if (removedEntireChannel) {
        state.humanDraft[side] = state.humanDraft[side].filter((item) => item !== track);
      } else {
        track.pairs.splice(pairIndex, 1);
      }
      state.humanDirty = true;
      state.inputSource = "human";
      renderHumanSide(side);
      setMessage(
        removedEntireChannel
          ? `${humanSideLabel(side)} CH${Core.hexByte(identifier)} 已移除并恢复为未声明通道`
          : `${humanSideLabel(side)} CH${Core.hexByte(identifier)} 已删除第 ${pairIndex + 1} 组`,
        "success",
      );
    }
  }

  function loadHumanDraftFromFields(announce = false) {
    const analysis = Core.parseProject(getFields());
    if (!analysis.valid) {
      setMessage(analysis.errors.join("；") || "当前代码中没有可翻译的 Channel", "error");
      return false;
    }
    state.humanDraft = humanDraftFromAnalysis(analysis);
    state.humanDirty = false;
    renderHumanReadable();
    if (announce) setMessage("已从当前十六进制代码翻译为时间/亮度控制点", "success");
    return true;
  }

  function syncFieldsFromHumanDraft({ preview = false } = {}) {
    if (elements.humanModePanel.querySelector("input.is-invalid")) {
      setMessage("人类可读视图中仍有无效数值，请先修正", "error");
      return false;
    }
    const encoded = Core.encodeProject(humanAnalysisFromDraft());
    if (!encoded.valid) {
      setMessage(encoded.errors.join("；"), "error");
      return false;
    }
    const fields = fieldsFromEncoded(encoded);
    setFields(fields);
    elements.templateInput.value = templateFromFields(fields, "Human-readable editor generated data");
    if (!syncByteGridFromFields()) return false;
    state.humanDirty = false;
    state.inputSource = "human";
    if (preview) parseInputs("人类可读数据已生成十六进制并预览");
    return true;
  }

  function applyHumanReadable() {
    syncFieldsFromHumanDraft({ preview: true });
  }

  function normalizeByteValue(value, blankAsZero = true) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return blankAsZero ? { valid: true, hex: "00" } : { valid: true, hex: "" };
    const withoutPrefix = trimmed.replace(/^0x/i, "");
    if (/^[0-9a-f]$/i.test(withoutPrefix)) {
      return { valid: true, hex: `0${withoutPrefix.toUpperCase()}` };
    }
    if (/^[0-9a-f]{2}$/i.test(withoutPrefix)) {
      return { valid: true, hex: withoutPrefix.toUpperCase() };
    }
    return { valid: false, hex: trimmed.toUpperCase() };
  }

  function formatByteList(bytes) {
    const lines = [];
    for (let index = 0; index < bytes.length; index += 16) {
      lines.push(bytes.slice(index, index + 16).map(Core.hexByte).join(", "));
    }
    return lines.join(",\n");
  }

  function fieldsFromEncoded(encoded) {
    function splitSide(bytes) {
      return {
        staging1: formatByteList(bytes.slice(0, Core.LIMITS.staging1)),
        staging2: formatByteList(bytes.slice(Core.LIMITS.staging1)),
      };
    }
    const left = splitSide(encoded.left.bytes);
    const right = splitSide(encoded.right.bytes);
    return {
      left1: left.staging1,
      left2: left.staging2,
      right1: right.staging1,
      right2: right.staging2,
    };
  }

  function templateFromFields(fields, description = "Curve editor generated data") {
    return `Source: G20 2020 PreLCI EU Laserlight
Description: ${description}

FLM2 Left [43]
Staging1_Data:
${fields.left1}

Staging2_Data:
${fields.left2}

FLM2 Right [44]
Staging1_Data:
${fields.right1}

Staging2_Data:
${fields.right2}`;
  }

  function cloneAnalysis(analysis) {
    if (typeof structuredClone === "function") return structuredClone(analysis);
    return JSON.parse(JSON.stringify(analysis));
  }

  function byteFields() {
    return {
      left1: elements.left1.value,
      left2: elements.left2.value,
      right1: elements.right1.value,
      right2: elements.right2.value,
    };
  }

  function setFields(fields) {
    elements.left1.value = fields.left1 || "";
    elements.left2.value = fields.left2 || "";
    elements.right1.value = fields.right1 || "";
    elements.right2.value = fields.right2 || "";
  }

  function getFields() {
    const fields = {
      left1: elements.left1.value,
      left2: elements.left2.value,
      right1: elements.right1.value,
      right2: elements.right2.value,
    };
    if (elements.mirrorLeft.checked && !fields.right1.trim()) {
      fields.right1 = fields.left1;
      fields.right2 = fields.left2;
      elements.right1.value = fields.right1;
      elements.right2.value = fields.right2;
    }
    return fields;
  }

  function applyPasteInput(announce = true) {
    const text = elements.templateInput.value.trim();
    if (!text) {
      if (announce) setMessage("请粘贴完整模板或字节数据", "error");
      return false;
    }

    const looksLikeTemplate = /FLM2\s+(?:Left|Right)|Staging1_Data/i.test(text);
    if (looksLikeTemplate) {
      const result = Core.extractTemplate(text);
      if (result.errors.length) {
        setMessage(result.errors.join("；"), "error");
        return false;
      }
      setFields(result.fields);
      state.inputSource = "fields";
      if (announce) setMessage("完整模板已识别并拆分为左右数据", "success");
      return true;
    }

    const parsed = Core.parseByteString(text, "粘贴字节");
    if (parsed.errors.length) {
      setMessage(parsed.errors.join("；"), "error");
      return false;
    }
    const capacity = Core.LIMITS.staging1 + Core.LIMITS.staging2;
    if (parsed.bytes.length > capacity) {
      setMessage(`粘贴数据为 ${parsed.bytes.length} Byte，超过每侧 ${capacity} Byte 容量`, "error");
      return false;
    }

    const staging1 = formatByteList(parsed.bytes.slice(0, Core.LIMITS.staging1));
    const staging2 = formatByteList(parsed.bytes.slice(Core.LIMITS.staging1));
    const target = elements.pasteTarget.value;
    if (target === "both") {
      setFields({ left1: staging1, left2: staging2, right1: staging1, right2: staging2 });
      elements.mirrorLeft.checked = true;
    } else if (target === "left") {
      setFields({ left1: staging1, left2: staging2, right1: "", right2: "" });
      elements.mirrorLeft.checked = false;
    } else {
      setFields({ left1: "", left2: "", right1: staging1, right2: staging2 });
      elements.mirrorLeft.checked = false;
    }
    state.inputSource = "fields";
    if (announce) {
      setMessage(`已读取 ${parsed.bytes.length} Byte 并自动分配 Staging1 / Staging2`, "success");
    }
    return true;
  }

  function importTemplate() {
    applyPasteInput(true);
  }

  function syncByteGridFromFields() {
    const fields = byteFields();
    const errors = [];
    BYTE_GRID_CONFIG.forEach((config) => {
      const parsed = Core.parseByteString(fields[config.key], `${config.key} 数据`);
      errors.push(...parsed.errors);
      state.byteInputs[config.key].forEach((input, index) => {
        input.value = index < parsed.bytes.length ? Core.hexByte(parsed.bytes[index]) : "";
        input.classList.remove("is-invalid");
      });
    });
    if (errors.length) {
      setMessage(errors.join("；"), "error");
      return false;
    }
    renderByteChannelSections();
    return true;
  }

  function syncFieldsFromByteGrid() {
    const fields = {};
    const errors = [];
    BYTE_GRID_CONFIG.forEach((config) => {
      const bytes = [];
      state.byteInputs[config.key].forEach((input, index) => {
        const normalized = normalizeByteValue(input.value, true);
        input.classList.toggle("is-invalid", !normalized.valid);
        if (!normalized.valid) {
          const globalIndex = config.offset + index + 1;
          const sideLabel = config.side === "left" ? "车辆左 [43]" : "车辆右 [44]";
          errors.push(`${sideLabel} Byte ${String(globalIndex).padStart(3, "0")} 的值“${input.value}”无效`);
          return;
        }
        input.value = normalized.hex;
        bytes.push(parseInt(normalized.hex, 16));
      });
      fields[config.key] = formatByteList(bytes);
    });
    if (errors.length) {
      setMessage(errors.slice(0, 8).join("；"), "error");
      return false;
    }
    setFields(fields);
    state.inputSource = "bytes";
    renderByteChannelSections();
    return true;
  }

  function setByteSide(side) {
    state.byteSide = side;
    const isLeft = side === "left";
    elements.byteSideLeft.hidden = !isLeft;
    elements.byteSideRight.hidden = isLeft;
    elements.byteLeftBtn.classList.toggle("is-active", isLeft);
    elements.byteRightBtn.classList.toggle("is-active", !isLeft);
    elements.byteLeftBtn.setAttribute("aria-selected", String(isLeft));
    elements.byteRightBtn.setAttribute("aria-selected", String(!isLeft));
  }

  function setInputMode(mode) {
    if (mode === state.inputMode) return;

    if (state.inputMode === "bytes" && !syncFieldsFromByteGrid()) return;
    if (state.inputMode === "human" && !syncFieldsFromHumanDraft()) return;
    if (state.inputMode === "paste" && state.inputSource === "paste" && elements.templateInput.value.trim()) {
      if (!applyPasteInput(false)) return;
    }

    if (mode === "bytes") {
      if (!syncByteGridFromFields()) return;
      state.inputSource = "bytes";
    } else if (mode === "human") {
      if (!loadHumanDraftFromFields()) return;
      state.inputSource = "human";
    } else {
      const fields = byteFields();
      elements.templateInput.value = templateFromFields(fields, "Current working data");
      state.inputSource = "paste";
    }

    state.inputMode = mode;
    const isPaste = mode === "paste";
    const isBytes = mode === "bytes";
    const isHuman = mode === "human";
    elements.pasteModePanel.hidden = !isPaste;
    elements.byteModePanel.hidden = !isBytes;
    elements.humanModePanel.hidden = !isHuman;
    elements.pasteModeBtn.classList.toggle("is-active", isPaste);
    elements.byteModeBtn.classList.toggle("is-active", isBytes);
    elements.humanModeBtn.classList.toggle("is-active", isHuman);
    elements.pasteModeBtn.setAttribute("aria-selected", String(isPaste));
    elements.byteModeBtn.setAttribute("aria-selected", String(isBytes));
    elements.humanModeBtn.setAttribute("aria-selected", String(isHuman));
  }

  function clearByteInputs() {
    Object.values(state.byteInputs).flat().forEach((input) => {
      input.value = "";
      input.classList.remove("is-invalid");
    });
    renderByteChannelSections();
  }

  function previewInputs() {
    if (state.inputMode === "bytes") {
      if (!syncFieldsFromByteGrid()) return;
    } else if (state.inputMode === "human") {
      syncFieldsFromHumanDraft({ preview: true });
      return;
    } else if (state.inputSource === "paste" && elements.templateInput.value.trim()) {
      if (!applyPasteInput(false)) return;
    }
    parseInputs("自定义数据预览成功");
  }

  function handleByteInput(event) {
    const input = event.target.closest(".byte-cell input");
    if (!input) return;
    input.value = input.value.toUpperCase().slice(0, 4);
    input.classList.remove("is-invalid");
    state.inputSource = "bytes";
  }

  function handleByteBlur(event) {
    const input = event.target.closest(".byte-cell input");
    if (!input || !input.value.trim()) return;
    const normalized = normalizeByteValue(input.value, false);
    input.classList.toggle("is-invalid", !normalized.valid);
    if (normalized.valid) input.value = normalized.hex;
  }

  function handleBytePaste(event) {
    const input = event.target.closest(".byte-cell input");
    if (!input) return;
    const text = event.clipboardData?.getData("text") || "";
    const parsed = Core.parseByteString(text, "粘贴字节");
    event.preventDefault();
    if (parsed.errors.length || !parsed.bytes.length) {
      input.classList.add("is-invalid");
      setMessage(parsed.errors.join("；") || "粘贴内容中没有字节", "error");
      return;
    }

    const side = input.dataset.side;
    const sideInputs = [
      ...state.byteInputs[`${side}1`],
      ...state.byteInputs[`${side}2`],
    ];
    const start = Number(input.dataset.globalIndex);
    parsed.bytes.forEach((byte, index) => {
      const target = sideInputs[start + index];
      if (!target) return;
      target.value = Core.hexByte(byte);
      target.classList.remove("is-invalid");
    });
    const written = Math.min(parsed.bytes.length, sideInputs.length - start);
    const next = sideInputs[start + written];
    next?.focus();
    state.inputSource = "bytes";
    setMessage(`已从 Byte ${String(start + 1).padStart(3, "0")} 起写入 ${written} Byte`, "success");
  }

  function loadSample(sampleKey, message) {
    const sample = Samples[sampleKey];
    elements.templateInput.value = sample.template;
    setFields(sample);
    state.inputSource = "paste";
    parseInputs(message);
  }

  function parseInputs(successPrefix = "解析成功") {
    if (state.curveEditor.active) {
      state.curveEditor.originalAnalysis = null;
      state.curveEditor.originalFields = null;
      state.curveEditor.selected = null;
      state.curveEditor.dragging = null;
      state.curveEditor.axisDuration = 0;
      state.curveEditor.zoom = 1;
      state.curveEditor.viewStart = 0;
      state.curveEditor.contextTarget = null;
      setCurveEditorUi(false);
    }
    const analysis = Core.parseProject(getFields());
    state.analysis = analysis;
    state.currentTime = 0;
    state.playing = false;
    updatePlayButton();

    if (!analysis.valid) {
      const message = analysis.errors.length
        ? analysis.errors.join("；")
        : "没有找到可播放的序列";
      setMessage(message, "error");
      resetMetrics();
      renderDiagnostics();
      renderScene();
      renderCurveChart();
      return;
    }

    elements.timeline.max = String(analysis.duration);
    elements.timeline.value = "0";
    elements.durationMetric.textContent = `${(analysis.duration / 1000).toFixed(2)} s`;
    elements.channelMetric.textContent = String(analysis.channelIds.length);
    elements.sequenceMetric.textContent = String(
      analysis.left.tracks.length + analysis.right.tracks.length,
    );
    elements.totalTime.textContent = `${(analysis.duration / 1000).toFixed(2)} s`;
    setMessage(
      `${successPrefix}：左 ${analysis.left.tracks.length} 条 / 右 ${analysis.right.tracks.length} 条`,
      "success",
    );
    renderDiagnostics();
    renderWarnings();
    renderCurveChart();
    updateFrameUi();
  }

  function resetMetrics() {
    elements.durationMetric.textContent = "—";
    elements.channelMetric.textContent = "—";
    elements.sequenceMetric.textContent = "—";
    elements.totalTime.textContent = "0.00 s";
    elements.currentTime.textContent = "0.00";
    elements.timeline.max = "1000";
    elements.timeline.value = "0";
  }

  function setCurveView(view) {
    state.curveView = view;
    const buttons = {
      right: elements.viewRightBtn,
      left: elements.viewLeftBtn,
      both: elements.viewBothBtn,
    };
    Object.entries(buttons).forEach(([key, button]) => {
      const active = key === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    elements.curveSideLegend.textContent = view === "both"
      ? "实线 LEFT [43] · 虚线 RIGHT [44]"
      : view === "left"
        ? "仅显示车辆左大灯 LEFT [43]"
        : "仅显示车辆右大灯 RIGHT [44]";
    state.curveEditor.selected = null;
    syncSelectedPointInputs();
    renderCurveChart();
  }

  function toggleCurveChannel(identifier) {
    if (state.visibleChannels.has(identifier)) state.visibleChannels.delete(identifier);
    else state.visibleChannels.add(identifier);
    elements.curveChannelButtons.forEach((button) => {
      const channel = Number(button.dataset.channel);
      const active = state.visibleChannels.has(channel);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (state.curveEditor.selected && !state.visibleChannels.has(state.curveEditor.selected.identifier)) {
      state.curveEditor.selected = null;
      syncSelectedPointInputs();
    }
    hideCurveContextMenu();
    renderCurveChart();
  }

  function resizeCurveCanvas() {
    if (!state.curveEditor.active) {
      curveCanvas.width = 1351;
      curveCanvas.height = 520;
      renderCurveChart();
      return;
    }
    const rect = curveCanvas.getBoundingClientRect();
    curveCanvas.width = Math.max(900, Math.round(rect.width));
    curveCanvas.height = Math.max(480, Math.round(rect.height));
    renderCurveChart();
  }

  function setCurveEditorUi(active) {
    state.curveEditor.active = active;
    elements.curveEditorPanel.hidden = !active;
    elements.editCurveBtn.classList.toggle("is-active", active);
    elements.editCurveBtn.textContent = active ? "正在编辑曲线" : "编辑曲线";
    elements.editCurveBtn.disabled = active;
    curveCanvas.classList.toggle("is-editing", active);
    curveCanvas.style.cursor = active ? "crosshair" : "";
    elements.curvePanel.classList.toggle("is-fullscreen", active);
    document.body.classList.toggle("curve-editor-open", active);
    hideCurveContextMenu();
    syncSelectedPointInputs();
    updateCurveZoomUi();
    requestAnimationFrame(resizeCurveCanvas);
  }

  function beginCurveEditing() {
    if (!state.analysis?.valid) {
      setMessage("请先预览有效字节，再进入曲线编辑", "error");
      return;
    }
    state.playing = false;
    updatePlayButton();
    state.curveEditor.originalAnalysis = state.analysis;
    state.curveEditor.originalFields = byteFields();
    state.curveEditor.selected = null;
    state.curveEditor.dragging = null;
    state.curveEditor.axisDuration = state.analysis.duration;
    state.curveEditor.zoom = 1;
    state.curveEditor.viewStart = 0;
    state.curveEditor.contextTarget = null;
    state.analysis = cloneAnalysis(state.analysis);
    elements.curveEditStatus.value = "编辑已开启：拖动节点，或在线上右键新增节点";
    setCurveEditorUi(true);
  }

  function leaveCurveEditing({ restore = false } = {}) {
    if (restore && state.curveEditor.originalAnalysis) {
      state.analysis = state.curveEditor.originalAnalysis;
      if (state.curveEditor.originalFields) setFields(state.curveEditor.originalFields);
    }
    state.curveEditor.originalAnalysis = null;
    state.curveEditor.originalFields = null;
    state.curveEditor.selected = null;
    state.curveEditor.dragging = null;
    state.curveEditor.axisDuration = 0;
    state.curveEditor.zoom = 1;
    state.curveEditor.viewStart = 0;
    state.curveEditor.contextTarget = null;
    setCurveEditorUi(false);
    updateFrameUi();
  }

  function encodeCurrentCurves() {
    const encoded = Core.encodeProject(state.analysis);
    if (!encoded.valid) {
      elements.curveEditStatus.value = encoded.errors.join("；");
      return null;
    }
    return { encoded, fields: fieldsFromEncoded(encoded) };
  }

  function applyCurveEdits() {
    const result = encodeCurrentCurves();
    if (!result) return;
    setFields(result.fields);
    elements.templateInput.value = templateFromFields(result.fields);
    state.inputSource = "fields";
    syncByteGridFromFields();
    leaveCurveEditing();
    parseInputs("曲线已量化、生成十六进制并载入全部输入区");
  }

  function saveCurrentCurves() {
    const result = encodeCurrentCurves();
    if (!result) return;
    try {
      localStorage.setItem(SAVED_CURVE_KEY, JSON.stringify({
        fields: result.fields,
        savedAt: new Date().toISOString(),
      }));
      elements.curveEditStatus.value = "当前左右曲线已保存到此浏览器";
    } catch (error) {
      elements.curveEditStatus.value = "浏览器拒绝保存曲线，请检查本地存储权限";
    }
  }

  function loadSavedCurves() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_CURVE_KEY) || "null");
      if (!saved?.fields) {
        elements.curveEditStatus.value = "此浏览器中还没有已保存的曲线";
        return;
      }
      const analysis = Core.parseProject(saved.fields);
      if (!analysis.valid) {
        elements.curveEditStatus.value = `已保存曲线无法解析：${analysis.errors.join("；")}`;
        return;
      }
      setFields(saved.fields);
      elements.templateInput.value = templateFromFields(saved.fields, "Loaded from saved curve");
      state.inputSource = "fields";
      syncByteGridFromFields();
      leaveCurveEditing();
      parseInputs("已加载保存的曲线和十六进制代码");
    } catch (error) {
      elements.curveEditStatus.value = "已保存曲线已损坏，无法加载";
    }
  }

  function visibleCurveTracks() {
    if (!state.analysis?.valid) return [];
    const sideDefinitions = state.curveView === "both"
      ? [
        { key: "left", side: state.analysis.left, dashed: false },
        { key: "right", side: state.analysis.right, dashed: true },
      ]
      : [{
        key: state.curveView,
        side: state.analysis[state.curveView],
        dashed: false,
      }];
    return sideDefinitions.flatMap((definition) => (
      state.analysis.channelIds.filter((identifier) => state.visibleChannels.has(identifier)).map((identifier) => ({
        ...definition,
        identifier,
        track: Core.trackById(definition.side, identifier),
      })).filter((item) => item.track)
    ));
  }

  function curveGeometry() {
    const axisDuration = state.curveEditor.active
      ? state.curveEditor.axisDuration
      : state.analysis?.duration || 0;
    const zoom = state.curveEditor.active ? state.curveEditor.zoom : 1;
    const duration = axisDuration > 0 ? axisDuration / zoom : 0;
    const maxStart = Math.max(0, axisDuration - duration);
    const viewStart = state.curveEditor.active
      ? Math.max(0, Math.min(maxStart, state.curveEditor.viewStart))
      : 0;
    const viewEnd = viewStart + duration;
    const plotWidth = curveCanvas.width - CURVE_MARGIN.left - CURVE_MARGIN.right;
    const plotHeight = curveCanvas.height - CURVE_MARGIN.top - CURVE_MARGIN.bottom;
    return {
      axisDuration,
      duration,
      viewStart,
      viewEnd,
      maxStart,
      plotWidth,
      plotHeight,
      xAt: (time) => CURVE_MARGIN.left + ((time - viewStart) / duration) * plotWidth,
      timeAt: (x) => viewStart + ((x - CURVE_MARGIN.left) / plotWidth) * duration,
      yAt: (brightness) => CURVE_MARGIN.top + (1 - brightness / 100) * plotHeight,
      brightnessAt: (y) => (1 - (y - CURVE_MARGIN.top) / plotHeight) * 100,
    };
  }

  function curvePointerPosition(event) {
    const rect = curveCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (curveCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (curveCanvas.height / rect.height),
    };
  }

  function refreshCurveTrack(track) {
    track.points.forEach((point, index) => {
      point.time = Math.max(0, Math.round(Number(point.time) / 10) * 10);
      point.brightness = Math.max(0, Math.min(100, Math.round(Number(point.brightness))));
      point.rawBrightness = point.brightness;
      if (index > 0) point.duration = point.time - track.points[index - 1].time;
    });
    const finalPoint = track.points[track.points.length - 1];
    track.duration = finalPoint?.time || 0;
    track.finalBrightness = finalPoint?.brightness || 0;
    track.pairCount = Math.max(0, track.points.length - 1);
  }

  function syncSelectedPointInputs() {
    const target = state.curveEditor.selected;
    const point = target?.track?.points?.[target.pointIndex];
    const enabled = Boolean(state.curveEditor.active && point);
    elements.pointTimeInput.disabled = !enabled;
    elements.pointBrightnessInput.disabled = !enabled;
    elements.pointTimeInput.value = enabled ? String(Math.round(point.time)) : "";
    elements.pointBrightnessInput.value = enabled ? String(Math.round(point.brightness)) : "";
    if (enabled) {
      const previous = target.track.points[target.pointIndex - 1];
      const next = target.track.points[target.pointIndex + 1];
      elements.pointTimeInput.min = String(previous.time);
      elements.pointTimeInput.max = String(next ? next.time : state.curveEditor.axisDuration);
    }
  }

  function updateSelectedPointFromInputs() {
    const target = state.curveEditor.selected;
    const point = target?.track?.points?.[target.pointIndex];
    if (!point) return;
    const previous = target.track.points[target.pointIndex - 1];
    const next = target.track.points[target.pointIndex + 1];
    const requestedTime = Math.round(Number(elements.pointTimeInput.value) / 10) * 10;
    const requestedBrightness = Math.round(Number(elements.pointBrightnessInput.value));
    const maxTime = next ? next.time : state.curveEditor.axisDuration;
    point.time = Math.max(previous.time, Math.min(maxTime, requestedTime));
    point.brightness = Math.max(0, Math.min(100, requestedBrightness));
    refreshCurveTrack(target.track);
    state.currentTime = point.time;
    describeCurvePoint(target);
    renderCurveChart();
    updateFrameUi();
  }

  function handlePointInputKeydown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    updateSelectedPointFromInputs();
    event.currentTarget.blur();
  }

  function updateCurveZoomUi() {
    const geometry = curveGeometry();
    const zoomIndex = CURVE_ZOOM_LEVELS.indexOf(state.curveEditor.zoom);
    elements.zoomOutBtn.disabled = !state.curveEditor.active || zoomIndex <= 0;
    elements.zoomInBtn.disabled = !state.curveEditor.active || zoomIndex >= CURVE_ZOOM_LEVELS.length - 1;
    elements.zoomFitBtn.disabled = !state.curveEditor.active;
    elements.zoomFitBtn.textContent = `${state.curveEditor.zoom}×`;
    elements.curvePan.disabled = !state.curveEditor.active || geometry.maxStart <= 0;
    elements.curvePan.max = String(Math.round(geometry.maxStart));
    elements.curvePan.value = String(Math.round(geometry.viewStart));
  }

  function setCurveZoom(direction) {
    if (!state.curveEditor.active) return;
    const currentIndex = CURVE_ZOOM_LEVELS.indexOf(state.curveEditor.zoom);
    const nextIndex = direction === "fit"
      ? 0
      : Math.max(0, Math.min(CURVE_ZOOM_LEVELS.length - 1, currentIndex + direction));
    const oldGeometry = curveGeometry();
    const focusTime = state.curveEditor.selected
      ? state.curveEditor.selected.track.points[state.curveEditor.selected.pointIndex].time
      : oldGeometry.viewStart + oldGeometry.duration / 2;
    state.curveEditor.zoom = CURVE_ZOOM_LEVELS[nextIndex];
    const visibleDuration = state.curveEditor.axisDuration / state.curveEditor.zoom;
    const maxStart = Math.max(0, state.curveEditor.axisDuration - visibleDuration);
    state.curveEditor.viewStart = direction === "fit"
      ? 0
      : Math.max(0, Math.min(maxStart, focusTime - visibleDuration / 2));
    updateCurveZoomUi();
    renderCurveChart();
  }

  function hideCurveContextMenu() {
    elements.curveContextMenu.hidden = true;
    state.curveEditor.contextTarget = null;
  }

  function distanceToSegment(position, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared
      ? Math.max(0, Math.min(1, ((position.x - start.x) * dx + (position.y - start.y) * dy) / lengthSquared))
      : 0;
    const x = start.x + progress * dx;
    const y = start.y + progress * dy;
    return { distance: Math.hypot(position.x - x, position.y - y), x, y };
  }

  function hitCurveSegment(position) {
    const geometry = curveGeometry();
    let nearest = null;
    visibleCurveTracks().forEach((item) => {
      const points = item.track.points.map((point) => ({
        time: point.time,
        brightness: point.brightness,
      }));
      const finalPoint = points[points.length - 1];
      if (finalPoint.time < geometry.axisDuration) {
        points.push({ time: geometry.axisDuration, brightness: finalPoint.brightness });
      }
      for (let index = 1; index < points.length; index += 1) {
        const start = { x: geometry.xAt(points[index - 1].time), y: geometry.yAt(points[index - 1].brightness) };
        const end = { x: geometry.xAt(points[index].time), y: geometry.yAt(points[index].brightness) };
        const hit = distanceToSegment(position, start, end);
        if (hit.distance <= 14 && (!nearest || hit.distance <= nearest.distance)) {
          const time = Math.max(0, Math.min(
            geometry.axisDuration,
            Math.round(geometry.timeAt(hit.x) / 10) * 10,
          ));
          nearest = {
            ...item,
            distance: hit.distance,
            time,
            brightness: Math.round(Core.brightnessAt(item.track, time)),
          };
        }
      }
    });
    return nearest;
  }

  function showCurveContextMenu(event, target, action) {
    state.curveEditor.contextTarget = { ...target, action };
    const side = target.key === "left" ? "左 [43]" : "右 [44]";
    const point = action === "delete" ? target.track.points[target.pointIndex] : target;
    elements.curveContextLabel.textContent = `${side} · CH${Core.hexByte(target.identifier)} · ${Math.round(point.time)}ms · ${Math.round(point.brightness)}%`;
    elements.addCurvePointBtn.hidden = action !== "add";
    elements.deleteCurvePointBtn.hidden = action !== "delete";
    elements.curveContextMenu.hidden = false;
    const menuRect = elements.curveContextMenu.getBoundingClientRect();
    elements.curveContextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - menuRect.width - 12)}px`;
    elements.curveContextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - menuRect.height - 12)}px`;
  }

  function handleCurveContextMenu(event) {
    if (!state.curveEditor.active) return;
    event.preventDefault();
    const position = curvePointerPosition(event);
    const point = hitCurvePoint(position);
    if (point) {
      showCurveContextMenu(event, point, "delete");
      return;
    }
    const segment = hitCurveSegment(position);
    if (segment) showCurveContextMenu(event, segment, "add");
    else hideCurveContextMenu();
  }

  function addCurvePoint() {
    const target = state.curveEditor.contextTarget;
    if (!target || target.action !== "add") return;
    if (target.track.points.slice(1).some((point) => point.time === target.time)) {
      elements.curveEditStatus.value = "该时间已经存在控制点";
      hideCurveContextMenu();
      return;
    }
    const point = {
      time: target.time,
      brightness: target.brightness,
      rawBrightness: target.brightness,
    };
    let pointIndex = target.track.points.findIndex((candidate, index) => index > 0 && candidate.time > point.time);
    if (pointIndex < 0) pointIndex = target.track.points.length;
    target.track.points.splice(pointIndex, 0, point);
    refreshCurveTrack(target.track);
    state.curveEditor.selected = { ...target, pointIndex };
    describeCurvePoint(state.curveEditor.selected);
    hideCurveContextMenu();
    renderCurveChart();
  }

  function deleteCurvePoint() {
    const target = state.curveEditor.contextTarget;
    if (!target || target.action !== "delete") return;
    if (target.track.points.length <= 2) {
      elements.curveEditStatus.value = "每个通道至少需要保留一个可编码控制点";
      hideCurveContextMenu();
      return;
    }
    target.track.points.splice(target.pointIndex, 1);
    refreshCurveTrack(target.track);
    state.curveEditor.selected = null;
    syncSelectedPointInputs();
    hideCurveContextMenu();
    renderCurveChart();
  }

  function hitCurvePoint(position) {
    if (!state.curveEditor.active) return null;
    const geometry = curveGeometry();
    let nearest = null;
    visibleCurveTracks().forEach((item) => {
      item.track.points.slice(1).forEach((point, index) => {
        const dx = geometry.xAt(point.time) - position.x;
        const dy = geometry.yAt(point.brightness) - position.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= 22 && (!nearest || distance <= nearest.distance)) {
          nearest = { ...item, pointIndex: index + 1, distance };
        }
      });
    });
    return nearest;
  }

  function describeCurvePoint(target) {
    const point = target.track.points[target.pointIndex];
    const side = target.key === "left" ? "车辆左 [43]" : "车辆右 [44]";
    elements.curveEditStatus.value = `${side} · CH${Core.hexByte(target.identifier)} · ${Math.round(point.time)}ms · ${Math.round(point.brightness)}%`;
    syncSelectedPointInputs();
  }

  function handleCurvePointerDown(event) {
    hideCurveContextMenu();
    const target = hitCurvePoint(curvePointerPosition(event));
    if (!target) return;
    event.preventDefault();
    state.curveEditor.selected = target;
    state.curveEditor.dragging = { ...target, pointerId: event.pointerId };
    curveCanvas.setPointerCapture?.(event.pointerId);
    describeCurvePoint(target);
    renderCurveChart();
  }

  function handleCurvePointerMove(event) {
    if (!state.curveEditor.active) {
      curveCanvas.style.cursor = "";
      return;
    }
    const dragging = state.curveEditor.dragging;
    if (!dragging || dragging.pointerId !== event.pointerId) {
      curveCanvas.style.cursor = hitCurvePoint(curvePointerPosition(event)) ? "grab" : "crosshair";
      return;
    }
    event.preventDefault();
    const geometry = curveGeometry();
    const position = curvePointerPosition(event);
    const points = dragging.track.points;
    const point = points[dragging.pointIndex];
    const previous = points[dragging.pointIndex - 1];
    const next = points[dragging.pointIndex + 1];
    const rawTime = geometry.timeAt(position.x);
    const minTime = previous.time;
    const maxTime = next ? next.time : geometry.axisDuration;
    point.time = Math.max(minTime, Math.min(maxTime, Math.round(rawTime / 10) * 10));
    point.brightness = Math.max(0, Math.min(100, Math.round(geometry.brightnessAt(position.y))));
    refreshCurveTrack(dragging.track);
    state.currentTime = point.time;
    describeCurvePoint(dragging);
    renderCurveChart();
    updateFrameUi();
  }

  function handleCurvePointerUp(event) {
    const dragging = state.curveEditor.dragging;
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    state.curveEditor.dragging = null;
    curveCanvas.releasePointerCapture?.(event.pointerId);
    curveCanvas.style.cursor = "grab";
    renderCurveChart();
  }

  function niceTimeTickStep(duration, targetTicks = 12) {
    const rough = duration / targetTicks;
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
    const normalized = rough / magnitude;
    const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return Math.max(10, multiplier * magnitude);
  }

  function renderCurveChart() {
    const width = curveCanvas.width;
    const height = curveCanvas.height;
    const margin = CURVE_MARGIN;
    const geometry = curveGeometry();
    const { plotWidth, plotHeight, duration, axisDuration, viewStart, viewEnd, xAt, yAt } = geometry;

    curveContext.clearRect(0, 0, width, height);
    curveContext.fillStyle = "#080d0f";
    curveContext.fillRect(0, 0, width, height);

    if (!state.analysis?.valid || axisDuration <= 0) {
      curveContext.fillStyle = "rgba(190, 207, 202, 0.55)";
      curveContext.font = '600 18px "SFMono-Regular", Consolas, monospace';
      curveContext.textAlign = "center";
      curveContext.fillText("输入有效字节后显示五通道曲线", width / 2, height / 2);
      return;
    }

    curveContext.lineWidth = 1;
    curveContext.strokeStyle = "rgba(190, 207, 202, 0.13)";
    curveContext.fillStyle = "rgba(176, 194, 189, 0.68)";
    curveContext.font = '12px "SFMono-Regular", Consolas, monospace';

    const brightnessStep = state.curveEditor.active ? 10 : 20;
    for (let brightness = 0; brightness <= 100; brightness += brightnessStep) {
      const y = yAt(brightness);
      curveContext.beginPath();
      curveContext.moveTo(margin.left, y);
      curveContext.lineTo(width - margin.right, y);
      curveContext.stroke();
      curveContext.textAlign = "right";
      curveContext.textBaseline = "middle";
      curveContext.fillText(String(brightness), margin.left - 12, y);
    }

    const tickStep = niceTimeTickStep(duration, state.curveEditor.active ? 14 : 10);
    const firstTick = Math.ceil(viewStart / tickStep) * tickStep;
    for (let time = firstTick; time <= viewEnd + 0.001; time += tickStep) {
      const x = xAt(time);
      curveContext.beginPath();
      curveContext.moveTo(x, margin.top);
      curveContext.lineTo(x, height - margin.bottom);
      curveContext.stroke();
      curveContext.textAlign = "center";
      curveContext.textBaseline = "top";
      curveContext.fillText(String(Math.round(time)), x, height - margin.bottom + 12);
    }

    curveContext.save();
    curveContext.translate(20, margin.top + plotHeight / 2);
    curveContext.rotate(-Math.PI / 2);
    curveContext.fillStyle = "rgba(208, 222, 218, 0.78)";
    curveContext.textAlign = "center";
    curveContext.textBaseline = "top";
    curveContext.fillText("亮度 (%)", 0, 0);
    curveContext.restore();
    curveContext.fillStyle = "rgba(208, 222, 218, 0.78)";
    curveContext.textAlign = "center";
    curveContext.fillText("时间 (ms)", margin.left + plotWidth / 2, height - 18);

    function drawTrack(track, color, dashed, item) {
      if (!track?.points?.length) return;
      curveContext.save();
      curveContext.beginPath();
      curveContext.rect(margin.left, margin.top, plotWidth, plotHeight);
      curveContext.clip();
      curveContext.strokeStyle = color;
      curveContext.lineWidth = dashed ? 2.4 : 3.2;
      curveContext.globalAlpha = dashed ? 0.78 : 0.96;
      curveContext.setLineDash(dashed ? [10, 8] : []);
      curveContext.lineJoin = "round";
      curveContext.lineCap = "round";
      curveContext.beginPath();
      track.points.forEach((point, index) => {
        const x = xAt(point.time);
        const y = yAt(point.brightness);
        if (index === 0) curveContext.moveTo(x, y);
        else curveContext.lineTo(x, y);
      });
      const finalPoint = track.points[track.points.length - 1];
      if (finalPoint.time < axisDuration) {
        curveContext.lineTo(xAt(axisDuration), yAt(finalPoint.brightness));
      }
      curveContext.stroke();
      curveContext.restore();

      if (!state.curveEditor.active) return;
      track.points.slice(1).forEach((point, pointOffset) => {
        if (point.time < viewStart || point.time > viewEnd) return;
        const selected = state.curveEditor.selected
          && state.curveEditor.selected.key === item.key
          && state.curveEditor.selected.identifier === item.identifier
          && state.curveEditor.selected.pointIndex === pointOffset + 1;
        curveContext.save();
        curveContext.beginPath();
        curveContext.arc(xAt(point.time), yAt(point.brightness), selected ? 8 : 6, 0, Math.PI * 2);
        curveContext.fillStyle = selected ? "#ffffff" : "#080d0f";
        curveContext.strokeStyle = color;
        curveContext.lineWidth = selected ? 4 : 3;
        curveContext.fill();
        curveContext.stroke();
        curveContext.restore();
      });
    }

    visibleCurveTracks().forEach((item) => {
      const color = Core.CHANNELS[item.identifier]?.color || "#ffffff";
      drawTrack(item.track, color, item.dashed, item);
    });

    if (!visibleCurveTracks().length) {
      curveContext.fillStyle = "rgba(190, 207, 202, 0.55)";
      curveContext.font = '600 16px "SFMono-Regular", Consolas, monospace';
      curveContext.textAlign = "center";
      curveContext.fillText("已隐藏全部 Channel", margin.left + plotWidth / 2, margin.top + plotHeight / 2);
    }
  }

  function clearAll() {
    elements.templateInput.value = "";
    setFields({});
    state.analysis = null;
    state.currentTime = 0;
    state.playing = false;
    state.curveEditor.originalAnalysis = null;
    state.curveEditor.originalFields = null;
    state.curveEditor.selected = null;
    state.curveEditor.dragging = null;
    state.curveEditor.axisDuration = 0;
    state.curveEditor.zoom = 1;
    state.curveEditor.viewStart = 0;
    state.curveEditor.contextTarget = null;
    setCurveEditorUi(false);
    state.laneRefs.clear();
    elements.channelList.innerHTML = "";
    elements.warningList.innerHTML = "";
    elements.leftDrlOutput.value = "0%";
    elements.leftLowOutput.value = "0%";
    elements.rightDrlOutput.value = "0%";
    elements.rightLowOutput.value = "0%";
    clearByteInputs();
    state.humanDraft = { left: [], right: [] };
    state.humanDirty = false;
    elements.humanSectionsLeft.replaceChildren();
    elements.humanSectionsRight.replaceChildren();
    state.inputMode = "paste";
    state.inputSource = "paste";
    elements.pasteModePanel.hidden = false;
    elements.byteModePanel.hidden = true;
    elements.humanModePanel.hidden = true;
    elements.pasteModeBtn.classList.add("is-active");
    elements.byteModeBtn.classList.remove("is-active");
    elements.humanModeBtn.classList.remove("is-active");
    elements.pasteModeBtn.setAttribute("aria-selected", "true");
    elements.byteModeBtn.setAttribute("aria-selected", "false");
    elements.humanModeBtn.setAttribute("aria-selected", "false");
    setByteSide("left");
    setHumanSide("left");
    setMessage("输入已清空");
    resetMetrics();
    updatePlayButton();
    renderCurveChart();
    renderScene();
  }

  function renderDiagnostics() {
    elements.channelList.innerHTML = "";
    state.laneRefs.clear();
    if (!state.analysis?.valid) return;

    state.analysis.channelIds.forEach((identifier) => {
      const channel = Core.CHANNELS[identifier] || {
        code: `CH${Core.hexByte(identifier)}`,
        name: "未映射序列",
      };
      const row = document.createElement("div");
      row.className = "channel-row";
      row.style.setProperty("--channel-color", channel.color || "#b9f7ff");
      row.innerHTML = `
        <div class="channel-identity">
          <span class="channel-number">${Core.hexByte(identifier)}</span>
          <span class="channel-code">${channel.code}</span>
          <span class="channel-name">${channel.name}</span>
        </div>
        <div class="brightness-lane is-left">
          <span>LEFT [43]</span>
          <div class="brightness-track"><div class="brightness-fill"></div></div>
          <output>0.0%</output>
        </div>
        <div class="brightness-lane is-right">
          <span>RIGHT [44]</span>
          <div class="brightness-track"><div class="brightness-fill"></div></div>
          <output>0.0%</output>
        </div>
      `;
      elements.channelList.appendChild(row);
      const lanes = row.querySelectorAll(".brightness-lane");
      state.laneRefs.set(identifier, {
        leftFill: lanes[0].querySelector(".brightness-fill"),
        leftOutput: lanes[0].querySelector("output"),
        rightFill: lanes[1].querySelector(".brightness-fill"),
        rightOutput: lanes[1].querySelector("output"),
      });
    });
  }

  function renderWarnings() {
    elements.warningList.innerHTML = "";
    if (!state.analysis?.valid) return;

    const warnings = [...state.analysis.warnings];
    const ids = state.analysis.channelIds;
    const missing = [0x01, 0x02, 0x03, 0x04, 0x05].filter((id) => !ids.includes(id));
    if (missing.length) {
      warnings.push(`G20 PreLCI 实测 Mapping 缺少通道：${missing.map(Core.hexByte).join("、")}。对应灯组会按现有数据预览。`);
    }
    const unmapped = ids.filter((id) => !Core.CHANNELS[id]);
    if (unmapped.length) {
      warnings.push(`序列 ${unmapped.map(Core.hexByte).join("、")} 没有针对这台 G20 PreLCI 的实车灯组 Mapping，仅显示原始曲线。`);
    }
    warnings.push("CH04 实车即使写入 100% 也只呈现低亮近光；合成预览使用 0.32 视觉增益。");
    warnings.push("Laser/High Beam 在当前五通道 Mapping 中没有被调用，因此始终保持熄灭。");

    warnings.forEach((warning) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = warning;
      elements.warningList.appendChild(paragraph);
    });
  }

  function sideBrightness(side, identifier, time = state.currentTime) {
    if (!state.analysis?.valid) return 0;
    return Core.brightnessAt(Core.trackById(side, identifier), time);
  }

  function sideComposite(side, time = state.currentTime) {
    if (!state.analysis?.valid) {
      return { drl: 0, low: 0, laser: 0, turnSignal: 0, raw: {}, lowContributions: {} };
    }
    return Core.composeG20PreLci(side, time);
  }

  function updateCompositeOutputs() {
    const left = sideComposite(state.analysis?.left || { tracks: [] });
    const right = sideComposite(state.analysis?.right || { tracks: [] });
    elements.leftDrlOutput.value = `${left.drl.toFixed(0)}%`;
    elements.leftLowOutput.value = `${left.low.toFixed(0)}%`;
    elements.rightDrlOutput.value = `${right.drl.toFixed(0)}%`;
    elements.rightLowOutput.value = `${right.low.toFixed(0)}%`;
  }

  function updateDiagnostics() {
    if (!state.analysis?.valid) return;
    state.analysis.channelIds.forEach((identifier) => {
      const refs = state.laneRefs.get(identifier);
      if (!refs) return;
      const left = sideBrightness(state.analysis.left, identifier);
      const right = sideBrightness(state.analysis.right, identifier);
      refs.leftFill.style.width = `${left}%`;
      refs.leftOutput.value = `${left.toFixed(1)}%`;
      refs.rightFill.style.width = `${right}%`;
      refs.rightOutput.value = `${right.toFixed(1)}%`;
    });
  }

  function updateFrameUi() {
    elements.currentTime.textContent = (state.currentTime / 1000).toFixed(2);
    elements.timeline.value = String(Math.round(state.currentTime));
    updateDiagnostics();
    updateCompositeOutputs();
    renderScene();
  }

  function updatePlayButton() {
    elements.playBtn.textContent = state.playing ? "Ⅱ" : "▶";
    elements.playBtn.setAttribute("aria-label", state.playing ? "暂停" : "播放");
  }

  function togglePlayback() {
    if (!state.analysis?.valid || state.recording) return;
    if (state.currentTime >= state.analysis.duration) state.currentTime = 0;
    state.playing = !state.playing;
    state.lastFrame = performance.now();
    updatePlayButton();
  }

  function animate(now) {
    const elapsed = now - state.lastFrame;
    state.lastFrame = now;

    if (state.playing && state.analysis?.valid && !state.recording) {
      state.currentTime += elapsed * state.speed;
      if (state.currentTime >= state.analysis.duration) {
        if (elements.loopToggle.checked) {
          state.currentTime %= state.analysis.duration;
        } else {
          state.currentTime = state.analysis.duration;
          state.playing = false;
          updatePlayButton();
        }
      }
      updateFrameUi();
    }
    requestAnimationFrame(animate);
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function drawBackground() {
    context.fillStyle = "#030607";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (headlightAsset.background) {
      context.drawImage(headlightAsset.background, 0, 0, canvas.width, canvas.height);
    }
  }

  function drawSvgImage(image, opacity, color = "") {
    if (!image || opacity <= 0) return;
    context.save();
    context.globalAlpha = clamp01(opacity);
    if (color && opacity > 0.01) {
      const blur = Math.round(4 + opacity * 18);
      context.filter = `drop-shadow(0 0 ${blur}px ${color})`;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.restore();
  }

  function drawHeadlamp(side, sideId) {
    const composite = sideComposite(side);
    if (headlightAsset.ready) {
      drawSvgImage(headlightAsset.layers.get(`${sideId}-housing`), 1);
      svgLayerOrder.forEach((layer) => {
        const brightness = composite.raw[layer.identifier] || 0;
        drawSvgImage(
          headlightAsset.layers.get(`${sideId}-${layer.id}`),
          brightness / 100,
          layer.color,
        );
      });
    }
  }

  function renderScene() {
    drawBackground();
    if (state.analysis?.valid) {
      drawHeadlamp(state.analysis.right, "right");
      drawHeadlamp(state.analysis.left, "left");
    } else {
      const emptySide = { tracks: [] };
      drawHeadlamp(emptySide, "right");
      drawHeadlamp(emptySide, "left");
    }
    if (headlightAsset.error) {
      context.fillStyle = "rgba(255, 115, 95, 0.9)";
      context.font = "600 14px SFMono-Regular, Consolas, monospace";
      context.textAlign = "center";
      context.fillText(`SVG ASSET ERROR · ${headlightAsset.error}`, 640, 552);
    }
  }

  function setBimmerCodeStatus(message, type = "") {
    elements.bimmerCodeStatus.textContent = message;
    elements.bimmerCodeStatus.classList.toggle("is-success", type === "success");
    elements.bimmerCodeStatus.classList.toggle("is-error", type === "error");
  }

  function backupCardElements(side) {
    const title = side === "left" ? "Left" : "Right";
    return {
      card: elements[`bimmerCode${title}Card`],
      name: elements[`bimmerCode${title}Name`],
      identifier: elements[`bimmerCode${title}Identifier`],
      vin: elements[`bimmerCode${title}Vin`],
      cafd: elements[`bimmerCode${title}Cafd`],
    };
  }

  function renderBimmerCodeCard(side, info) {
    const card = backupCardElements(side);
    card.card.classList.toggle("is-ready", Boolean(info));
    card.name.textContent = info?.name || "尚未载入";
    card.identifier.textContent = info
      ? `${info.identifier || "未知"} / 0x${info.ecuAddress.toString(16).toUpperCase()}`
      : "—";
    card.vin.textContent = info?.vin || "—";
    card.cafd.textContent = info?.cafd || "—";
  }

  function resetBimmerCodeBackups(message = "请先载入同一辆车的左右 FLM2 备份。") {
    state.bimmerCode.left = null;
    state.bimmerCode.right = null;
    state.bimmerCode.busy = false;
    elements.bimmerCodeFileInput.value = "";
    elements.bimmerCodeExportBtn.disabled = true;
    renderBimmerCodeCard("left", null);
    renderBimmerCodeCard("right", null);
    setBimmerCodeStatus(message);
  }

  async function loadBimmerCodeBackups(event) {
    const files = [...(event.target.files || [])];
    if (!Backup) {
      resetBimmerCodeBackups("BimmerCode 备份模块未载入，请刷新网页后重试。");
      setBimmerCodeStatus("BimmerCode 备份模块未载入，请刷新网页后重试。", "error");
      return;
    }
    if (files.length !== 2) {
      resetBimmerCodeBackups();
      setBimmerCodeStatus(`需要同时选择左右两个 .cod 文件，当前选择了 ${files.length} 个。`, "error");
      return;
    }

    elements.bimmerCodeExportBtn.disabled = true;
    setBimmerCodeStatus("正在本地读取 binary plist 与 ECU 身份…");
    try {
      const pair = { left: null, right: null };
      for (const file of files) {
        const info = Backup.inspectBackup(await file.arrayBuffer(), file.name);
        if (info.side === "unknown") {
          throw new Error(`${file.name}：ECU 地址不是 FLM2 左 0x43 或右 0x44`);
        }
        if (pair[info.side]) throw new Error(`选择了两个车辆${info.side === "left" ? "左" : "右"} FLM2 备份`);
        pair[info.side] = info;
      }
      Backup.checkPair(pair.left, pair.right);
      state.bimmerCode.left = pair.left;
      state.bimmerCode.right = pair.right;
      renderBimmerCodeCard("left", pair.left);
      renderBimmerCodeCard("right", pair.right);
      elements.bimmerCodeExportBtn.disabled = false;
      setBimmerCodeStatus(
        `左右备份校验通过 · VIN ${pair.left.vin} · 只会替换 0x3009 / 0x300A`,
        "success",
      );
    } catch (error) {
      resetBimmerCodeBackups();
      setBimmerCodeStatus(error instanceof Error ? error.message : "备份读取失败", "error");
    }
  }

  function encodeCurrentAnimationForBackup() {
    let analysis;
    if (state.curveEditor.active) {
      analysis = state.analysis;
    } else {
      if (state.inputMode === "bytes" && !syncFieldsFromByteGrid()) {
        throw new Error("逐字节输入仍有无效值，请先修正");
      }
      if (state.inputMode === "human" && !syncFieldsFromHumanDraft()) {
        throw new Error("人类可读视图仍有无效值，请先修正");
      }
      if (state.inputMode === "paste" && state.inputSource === "paste" && elements.templateInput.value.trim()) {
        if (!applyPasteInput(false)) throw new Error("粘贴内容无法转换为 FLM2 数据");
      }
      analysis = Core.parseProject(getFields());
    }

    if (!analysis?.valid) {
      throw new Error(analysis?.errors?.join("；") || "当前动画数据无效，请先预览并修正");
    }
    const encoded = Core.encodeProject(analysis);
    if (!encoded.valid) throw new Error(encoded.errors.join("；") || "当前曲线无法编码为 420 Byte");
    return encoded;
  }

  function exportBimmerCodeBackups() {
    const { left, right } = state.bimmerCode;
    if (!left || !right || state.bimmerCode.busy) {
      setBimmerCodeStatus("请先载入并通过校验的左右 FLM2 备份。", "error");
      return;
    }

    state.bimmerCode.busy = true;
    elements.bimmerCodeExportBtn.disabled = true;
    setBimmerCodeStatus("正在将当前动画写入左右备份并执行回读校验…");
    try {
      Backup.checkPair(left, right);
      const encoded = encodeCurrentAnimationForBackup();
      const leftPatched = Backup.patchBackup(
        left,
        encoded.left.bytes.slice(0, Backup.STAGING1_LEN),
        encoded.left.bytes.slice(Backup.STAGING1_LEN),
      );
      const rightPatched = Backup.patchBackup(
        right,
        encoded.right.bytes.slice(0, Backup.STAGING1_LEN),
        encoded.right.bytes.slice(Backup.STAGING1_LEN),
      );
      const timestamp = Math.floor(Date.now() / 1000);
      const leftName = Backup.outputName(left.name, timestamp);
      const rightName = Backup.outputName(right.name, timestamp);
      const zip = Backup.createZip([
        { name: leftName, bytes: leftPatched.bytes },
        { name: rightName, bytes: rightPatched.bytes },
      ]);
      const safeVin = left.vin.replace(/[^A-Z0-9_-]/gi, "") || "FLM2";
      downloadBlob(
        new Blob([zip], { type: "application/zip" }),
        `BimmerCode-FLM2-${safeVin}-${timestamp}.zip`,
      );
      setBimmerCodeStatus(
        `ZIP 已生成 · 左右文件共用时间戳 ${timestamp} · 已回读确认 0x3009 / 0x300A`,
        "success",
      );
    } catch (error) {
      setBimmerCodeStatus(error instanceof Error ? error.message : "BimmerCode 备份生成失败", "error");
    } finally {
      state.bimmerCode.busy = false;
      elements.bimmerCodeExportBtn.disabled = !(state.bimmerCode.left && state.bimmerCode.right);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function savePng() {
    if (!headlightAsset.ready) {
      elements.exportStatus.textContent = headlightAsset.error || "大灯 SVG 仍在载入";
      return;
    }
    renderScene();
    canvas.toBlob((blob) => {
      if (!blob) {
        elements.exportStatus.textContent = "PNG 生成失败";
        return;
      }
      downloadBlob(blob, `flm-light-${Math.round(state.currentTime)}ms.png`);
      elements.exportStatus.textContent = "当前帧 PNG 已生成";
    }, "image/png");
  }

  function bestWebmMimeType() {
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  async function recordWebm() {
    if (!state.analysis?.valid) {
      elements.exportStatus.textContent = "请先解析有效数据";
      return;
    }
    if (state.recording) return;
    if (!headlightAsset.ready) {
      elements.exportStatus.textContent = headlightAsset.error || "大灯 SVG 仍在载入";
      return;
    }
    if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
      elements.exportStatus.textContent = "当前浏览器不支持 Canvas WebM 录制，请使用 Chrome 或 Edge";
      return;
    }

    const mimeType = bestWebmMimeType();
    if (!mimeType) {
      elements.exportStatus.textContent = "当前浏览器没有可用的 WebM 编码器";
      return;
    }

    const previous = {
      time: state.currentTime,
      playing: state.playing,
    };
    state.recording = true;
    state.playing = false;
    state.currentTime = 0;
    elements.webmBtn.disabled = true;
    elements.pngBtn.disabled = true;
    updatePlayButton();

    const stream = canvas.captureStream(60);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
    recorder.start(250);

    const startedAt = performance.now();
    await new Promise((resolve) => {
      function captureFrame(now) {
        const elapsed = now - startedAt;
        state.currentTime = Math.min(elapsed, state.analysis.duration);
        updateFrameUi();
        const progress = Math.min(100, (state.currentTime / state.analysis.duration) * 100);
        elements.exportStatus.textContent = `正在录制 WebM · ${progress.toFixed(0)}%`;
        if (elapsed < state.analysis.duration) requestAnimationFrame(captureFrame);
        else resolve();
      }
      requestAnimationFrame(captureFrame);
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());

    const blob = new Blob(chunks, { type: mimeType });
    downloadBlob(blob, "flm-light-animation.webm");
    elements.exportStatus.textContent = `WebM 已生成 · ${(blob.size / 1024 / 1024).toFixed(1)} MB`;

    state.currentTime = previous.time;
    state.playing = previous.playing;
    state.recording = false;
    state.lastFrame = performance.now();
    elements.webmBtn.disabled = false;
    elements.pngBtn.disabled = false;
    updatePlayButton();
    updateFrameUi();
  }

  elements.pasteModeBtn.addEventListener("click", () => setInputMode("paste"));
  elements.byteModeBtn.addEventListener("click", () => setInputMode("bytes"));
  elements.humanModeBtn.addEventListener("click", () => setInputMode("human"));
  elements.byteLeftBtn.addEventListener("click", () => setByteSide("left"));
  elements.byteRightBtn.addEventListener("click", () => setByteSide("right"));
  elements.byteModePanel.addEventListener("input", handleByteInput);
  elements.byteModePanel.addEventListener("focusout", handleByteBlur);
  elements.byteModePanel.addEventListener("paste", handleBytePaste);
  elements.byteModePanel.addEventListener("click", handleByteStructureClick);
  elements.humanLeftBtn.addEventListener("click", () => setHumanSide("left"));
  elements.humanRightBtn.addEventListener("click", () => setHumanSide("right"));
  elements.humanModePanel.addEventListener("input", handleHumanInput);
  elements.humanModePanel.addEventListener("click", handleHumanClick);
  elements.refreshHumanBtn.addEventListener("click", () => loadHumanDraftFromFields(true));
  elements.applyHumanBtn.addEventListener("click", applyHumanReadable);
  elements.templateInput.addEventListener("input", () => {
    state.inputSource = "paste";
  });
  [elements.left1, elements.left2, elements.right1, elements.right2].forEach((textarea) => {
    textarea.addEventListener("input", () => {
      state.inputSource = "fields";
    });
  });
  elements.splitTemplateBtn.addEventListener("click", importTemplate);
  elements.loadOriginalBtn.addEventListener("click", () => {
    loadSample("original2020", "已载入 2020 Original");
  });
  elements.loadV15Btn.addEventListener("click", () => {
    loadSample("v15", "已载入 MichaelNRW v15");
  });
  elements.loadDoubleSwipeFlashBtn.addEventListener("click", () => {
    loadSample("doubleSwipeFlash", "已载入 DoubleSwipe&Flash");
  });
  elements.parseBtn.addEventListener("click", previewInputs);
  elements.clearBtn.addEventListener("click", clearAll);
  elements.viewRightBtn.addEventListener("click", () => setCurveView("right"));
  elements.viewLeftBtn.addEventListener("click", () => setCurveView("left"));
  elements.viewBothBtn.addEventListener("click", () => setCurveView("both"));
  elements.curveChannelButtons.forEach((button) => {
    button.addEventListener("click", () => toggleCurveChannel(Number(button.dataset.channel)));
  });
  elements.editCurveBtn.addEventListener("click", beginCurveEditing);
  elements.applyCurveBtn.addEventListener("click", applyCurveEdits);
  elements.saveCurveBtn.addEventListener("click", saveCurrentCurves);
  elements.loadCurveBtn.addEventListener("click", loadSavedCurves);
  elements.cancelCurveBtn.addEventListener("click", () => leaveCurveEditing({ restore: true }));
  elements.pointTimeInput.addEventListener("change", updateSelectedPointFromInputs);
  elements.pointBrightnessInput.addEventListener("change", updateSelectedPointFromInputs);
  elements.pointTimeInput.addEventListener("keydown", handlePointInputKeydown);
  elements.pointBrightnessInput.addEventListener("keydown", handlePointInputKeydown);
  elements.zoomOutBtn.addEventListener("click", () => setCurveZoom(-1));
  elements.zoomFitBtn.addEventListener("click", () => setCurveZoom("fit"));
  elements.zoomInBtn.addEventListener("click", () => setCurveZoom(1));
  elements.curvePan.addEventListener("input", () => {
    state.curveEditor.viewStart = Number(elements.curvePan.value);
    hideCurveContextMenu();
    renderCurveChart();
  });
  elements.addCurvePointBtn.addEventListener("click", addCurvePoint);
  elements.deleteCurvePointBtn.addEventListener("click", deleteCurvePoint);
  curveCanvas.addEventListener("pointerdown", handleCurvePointerDown);
  curveCanvas.addEventListener("pointermove", handleCurvePointerMove);
  curveCanvas.addEventListener("pointerup", handleCurvePointerUp);
  curveCanvas.addEventListener("pointercancel", handleCurvePointerUp);
  curveCanvas.addEventListener("contextmenu", handleCurveContextMenu);
  elements.playBtn.addEventListener("click", togglePlayback);
  elements.timeline.addEventListener("input", () => {
    if (!state.analysis?.valid || state.recording) return;
    state.currentTime = Number(elements.timeline.value);
    state.playing = false;
    updatePlayButton();
    updateFrameUi();
  });
  elements.speedSelect.addEventListener("change", () => {
    state.speed = Number(elements.speedSelect.value);
  });
  elements.bimmerCodeFileInput.addEventListener("change", loadBimmerCodeBackups);
  elements.bimmerCodeResetBtn.addEventListener("click", () => resetBimmerCodeBackups());
  elements.bimmerCodeExportBtn.addEventListener("click", exportBimmerCodeBackups);
  elements.pngBtn.addEventListener("click", savePng);
  elements.webmBtn.addEventListener("click", recordWebm);

  document.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName;
    if (event.code === "Space" && !["TEXTAREA", "INPUT", "SELECT", "BUTTON"].includes(tag)) {
      event.preventDefault();
      togglePlayback();
    }
    if (event.key === "Escape") {
      if (!elements.curveContextMenu.hidden) hideCurveContextMenu();
      else if (state.curveEditor.active) leaveCurveEditing({ restore: true });
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!elements.curveContextMenu.hidden && !elements.curveContextMenu.contains(event.target)) {
      hideCurveContextMenu();
    }
  });
  window.addEventListener("resize", () => {
    if (state.curveEditor.active) resizeCurveCanvas();
  });

  initializeByteInputs();
  resetBimmerCodeBackups();
  loadHeadlightAsset();
  loadSample("original2020", "已载入 2020 Original");
  requestAnimationFrame(animate);
})();
