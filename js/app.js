const CARD_W = 124;
const CARD_H = 158;
const SPOUSE_GAP = 6;
const UNIT_GAP = 36;
const LEVEL_GAP = 78;

const ICON = {
  pencil: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
  spouse: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="8" r="3"></circle><circle cx="16" cy="9" r="2.4"></circle><path d="M3 19a5 5 0 0 1 10 0"></path><path d="M14 19a4 4 0 0 1 7 0"></path></svg>',
  child: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="8" r="3"></circle><path d="M4 19a6 6 0 0 1 12 0"></path><path d="M19 8v6M16 11h6"></path></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V5h6v2"></path><path d="M8 7l1 13h6l1-13"></path></svg>',
  move: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 8h12"></path><path d="M13 4l5 4-5 4"></path><path d="M20 16H8"></path><path d="M11 12l-5 4 5 4"></path></svg>',
};

const SILHOUETTE = {
  male: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="22" r="10" fill="#9aa6b2"></circle><path d="M14 56c2-14 10-18 18-18s16 4 18 18" fill="#9aa6b2"></path></svg>',
  female: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 30c1-12 6-20 14-20s13 8 14 20c3 1 5 3 5 7-6-3-9-8-19-8s-13 5-19 8c0-4 2-6 5-7z" fill="#9aa6b2"></path><circle cx="32" cy="24" r="8" fill="#9aa6b2"></circle><path d="M16 56c2-13 9-17 16-17s14 4 16 17" fill="#9aa6b2"></path></svg>',
};

const ui = {
  selectedId: null,
  panelOpen: false,
  linkMode: false,
  readOnly: false,
  query: "",
  scale: 1,
  tx: 40,
  ty: 40,
  userAdjusted: false,
};

let lastLayout = null;
let fitNext = false;
let drag = null;
let toastTimer = 0;

const canvas = document.getElementById("canvas");
const world = document.getElementById("world");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function norm(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

function yearsText(person) {
  if (!person) return "";
  if (person.birth && person.death) return person.birth + " – " + person.death;
  if (person.birth) return String(person.birth);
  if (person.death) return "– " + person.death;
  return "";
}

function parseYear(value) {
  const text = String(value ?? "").trim();
  if (!text) return { value: null };
  if (!/^\d{3,4}$/.test(text)) return { error: true };
  return { value: Number(text) };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}

function genderLabel(gender) {
  return gender === "female" ? "Nữ" : "Nam";
}

function defaultSelection(family) {
  if (family.people.some((person) => person.id === "do-thao")) return "do-thao";
  const first = family.people.find((person) => !person.external);
  return first ? first.id : null;
}

function persistUi() {
  try {
    sessionStorage.setItem("giapha-ui", JSON.stringify({
      familyId: Store.current().id,
      selectedId: ui.selectedId,
      panelOpen: ui.panelOpen,
    }));
  } catch { /* bỏ qua */ }
}

function bootSelection() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem("giapha-ui") || "null"); } catch { saved = null; }
  if (saved && saved.familyId && Store.state().families.some((family) => family.id === saved.familyId)) {
    Store.state().currentId = saved.familyId;
  }
  const family = Store.current();
  if (saved && saved.familyId === family.id && family.people.some((person) => person.id === saved.selectedId)) {
    ui.selectedId = saved.selectedId;
    ui.panelOpen = saved.panelOpen !== false;
    return;
  }
  ui.selectedId = defaultSelection(family);
  ui.panelOpen = !!ui.selectedId;
}

function layoutFamily(family) {
  const people = (family.people || []).filter((person) => !person.external);
  const byId = new Map(people.map((person) => [person.id, person]));
  const collapsed = new Set(family.collapsed || []);
  const assigned = new Set();
  const units = [];
  const ordered = people.slice().sort((a, b) => {
    const ap = a.fatherId || a.motherId ? 0 : 1;
    const bp = b.fatherId || b.motherId ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return (a.order ?? 999) - (b.order ?? 999);
  });

  ordered.forEach((person) => {
    if (assigned.has(person.id)) return;
    const spouses = (person.spouseIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (!person.fatherId && !person.motherId && spouses.some((spouse) => !assigned.has(spouse.id) && (spouse.fatherId || spouse.motherId))) return;
    const members = [person, ...spouses.filter((spouse) => !assigned.has(spouse.id))];
    const unique = [];
    members.forEach((member) => {
      if (assigned.has(member.id)) return;
      assigned.add(member.id);
      unique.push(member);
    });
    unique.sort((a, b) => (a.gender === b.gender ? (a.order ?? 0) - (b.order ?? 0) : a.gender === "male" ? -1 : 1));
    const anchor = unique.find((member) => member.fatherId || member.motherId) || unique.find((member) => member.gender === "male") || unique[0];
    units.push({
      id: unique.map((member) => member.id).sort().join("~"),
      anchorId: anchor.id,
      people: unique,
    });
  });

  people.forEach((person) => {
    if (assigned.has(person.id)) return;
    units.push({ id: person.id, anchorId: person.id, people: [person] });
  });

  const childMap = new Map(units.map((unit) => [unit.id, []]));
  const roots = [];
  units.forEach((unit) => {
    const anchor = byId.get(unit.anchorId);
    const parent = units.find((candidate) => candidate.people.some((member) => member.id === anchor.fatherId || member.id === anchor.motherId));
    if (parent && parent.id !== unit.id) childMap.get(parent.id).push(unit);
    else roots.push(unit);
  });
  childMap.forEach((list) => {
    list.sort((a, b) => {
      const pa = byId.get(a.anchorId);
      const pb = byId.get(b.anchorId);
      return (pa.order ?? 999) - (pb.order ?? 999) || (pa.birth ?? 9999) - (pb.birth ?? 9999) || pa.name.localeCompare(pb.name, "vi");
    });
  });

  function unitWidth(unit) {
    const count = unit.people.length;
    return count * CARD_W + Math.max(0, count - 1) * SPOUSE_GAP;
  }

  function measure(unit, stack) {
    if (stack.has(unit.id)) {
      unit.kids = [];
      unit.kidsW = 0;
      unit.sub = unitWidth(unit);
      return unit.sub;
    }
    stack.add(unit.id);
    const kids = collapsed.has(unit.id) ? [] : childMap.get(unit.id);
    unit.kids = kids;
    const own = unitWidth(unit);
    if (!kids.length) {
      unit.kidsW = 0;
      unit.sub = own;
      stack.delete(unit.id);
      return own;
    }
    let kidsW = 0;
    kids.forEach((kid, index) => {
      kidsW += measure(kid, stack);
      if (index) kidsW += UNIT_GAP;
    });
    unit.kidsW = kidsW;
    unit.sub = Math.max(own, kidsW);
    stack.delete(unit.id);
    return unit.sub;
  }

  const stack = new Set();
  roots.forEach((root) => measure(root, stack));

  function place(unit, left, y) {
    unit.x = left + (unit.sub - unitWidth(unit)) / 2;
    unit.y = y;
    if (!unit.kids.length) return;
    let cursor = left + (unit.sub - unit.kidsW) / 2;
    unit.kids.forEach((kid) => {
      place(kid, cursor, y + CARD_H + LEVEL_GAP);
      cursor += kid.sub + UNIT_GAP;
    });
  }

  let cursor = 32;
  roots.forEach((root) => {
    place(root, cursor, 36);
    cursor += root.sub + UNIT_GAP;
  });

  const genOf = new Map();
  let maxGen = 0;
  function walkGen(unit, generation) {
    unit.generation = generation;
    maxGen = Math.max(maxGen, generation);
    unit.people.forEach((person) => genOf.set(person.id, generation));
    (childMap.get(unit.id) || []).forEach((kid) => walkGen(kid, generation + 1));
  }
  roots.forEach((root) => walkGen(root, 1));

  const visible = [];
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  function collect(unit) {
    visible.push(unit);
    minX = Math.min(minX, unit.x);
    minY = Math.min(minY, unit.y);
    maxX = Math.max(maxX, unit.x + unitWidth(unit));
    maxY = Math.max(maxY, unit.y + CARD_H + ((childMap.get(unit.id) || []).length ? 20 : 0));
    if (!collapsed.has(unit.id)) unit.kids.forEach(collect);
  }
  if (roots.length) {
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    roots.forEach(collect);
  }

  return {
    units: visible,
    allUnits: units,
    genOf,
    maxGen,
    childMap,
    collapsed,
    minX, minY, maxX, maxY,
    unitWidth,
  };
}

function hiddenPeople(unit, childMap) {
  let count = 0;
  const walk = (node) => {
    (childMap.get(node.id) || []).forEach((kid) => {
      count += kid.people.length;
      walk(kid);
    });
  };
  walk(unit);
  return count;
}

function connectorModel(layout) {
  const items = [];
  layout.units.forEach((unit) => {
    const kids = layout.childMap.get(unit.id) || [];
    if (!kids.length) return;
    const cx = unit.x + layout.unitWidth(unit) / 2;
    const top = unit.y + CARD_H;
    const open = !layout.collapsed.has(unit.id);
    const yJoint = open ? top + LEVEL_GAP / 2 : top + 22;
    const segs = [[cx, top, cx, yJoint]];
    if (open && unit.kids.length) {
      const centers = unit.kids.map((kid) => kid.x + layout.unitWidth(kid) / 2);
      if (centers.length > 1) segs.push([Math.min(...centers), yJoint, Math.max(...centers), yJoint]);
      unit.kids.forEach((kid, index) => segs.push([centers[index], yJoint, centers[index], kid.y]));
    }
    items.push({ unit, cx, yJoint, open, segs, hidden: open ? 0 : hiddenPeople(unit, layout.childMap) });
  });
  return items;
}

function renderTree(layout) {
  if (!layout.units.length) {
    world.innerHTML = "";
    world.hidden = true;
    return;
  }
  world.hidden = false;
  const query = norm(ui.query);
  const cards = layout.units.map((unit) => unit.people.map((person, index) => {
    const left = unit.x + index * (CARD_W + SPOUSE_GAP);
    const classes = ["card", person.gender];
    if (person.id === ui.selectedId) classes.push("is-selected");
    if (query && norm(person.name).includes(query)) classes.push("is-match");
    return '<article class="' + classes.join(" ") + '" data-id="' + esc(person.id) + '" style="left:' + left + 'px;top:' + unit.y + 'px" role="button" tabindex="0" title="' + esc(person.name + (yearsText(person) ? " (" + yearsText(person) + ")" : "")) + '">' +
      '<span class="gen">' + unit.generation + "</span>" +
      '<div class="avatar">' + SILHOUETTE[person.gender] + "</div>" +
      '<div class="name">' + esc(person.name) + "</div>" +
      '<div class="years">' + esc(yearsText(person)) + "</div>" +
      "</article>";
  }).join("")).join("");
  const links = connectorModel(layout);
  const paths = links.map((item) => item.segs.map((seg) => '<path d="M ' + seg[0] + " " + seg[1] + " L " + seg[2] + " " + seg[3] + '"></path>').join("")).join("");
  const joints = links.map((item) => {
    const label = item.open ? "Thu gọn nhánh" : "Mở nhánh (" + item.hidden + " người)";
    return '<button type="button" class="joint" data-unit="' + esc(item.unit.id) + '" style="left:' + item.cx + "px;top:" + item.yJoint + 'px" title="' + label + '" aria-label="' + label + '">' + (item.open ? "−" : "+") + "</button>";
  }).join("");
  world.style.width = Math.max(layout.maxX + 72, 200) + "px";
  world.style.height = Math.max(layout.maxY + 72, 200) + "px";
  world.innerHTML = '<svg class="links">' + paths + "</svg>" + joints + cards;
}

function personButton(person) {
  if (!person) return "—";
  const suffix = person.external ? " (ngoài tộc)" : "";
  return '<button type="button" data-action="select" data-id="' + esc(person.id) + '">' + esc(person.name + suffix) + "</button>";
}

function renderPanel(family, layout) {
  const panel = document.getElementById("panel");
  const person = ui.selectedId ? family.people.find((item) => item.id === ui.selectedId) : null;
  if (!ui.panelOpen || !person) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const generation = layout.genOf.get(person.id);
  const spouses = (person.spouseIds || []).map((id) => family.people.find((item) => item.id === id)).filter(Boolean);
  const children = family.people.filter((item) => item.fatherId === person.id || item.motherId === person.id);
  const father = family.people.find((item) => item.id === person.fatherId) || family.people.find((item) => item.id === person.externalFatherId);
  const mother = family.people.find((item) => item.id === person.motherId) || family.people.find((item) => item.id === person.externalMotherId);
  const initial = Array.from(person.name.trim())[0] || "?";
  const life = yearsText(person) || "—";
  const genLabel = person.external ? "Ngoài tộc" : "Đời " + (generation || "—");
  panel.hidden = false;
  panel.innerHTML =
    '<button type="button" class="panel-x" data-action="close-panel" aria-label="Đóng">×</button>' +
    '<div class="who"><div class="avatar-letter ' + person.gender + '">' + esc(initial) + "</div><div>" +
    "<h2>" + esc(person.name) + "</h2>" +
    '<p class="meta">' + genderLabel(person.gender) + " · " + genLabel + "</p>" +
    '<span class="pill ' + person.gender + '">' + genderLabel(person.gender) + "</span></div></div><hr>" +
    '<dl class="kv">' +
    "<dt>Sinh – mất</dt><dd>" + esc(life) + "</dd>" +
    "<dt>Thân phụ</dt><dd>" + personButton(father) + "</dd>" +
    "<dt>Thân mẫu</dt><dd>" + personButton(mother) + "</dd>" +
    "<dt>Vợ / chồng</dt><dd>" + (spouses.length ? spouses.map(personButton).join("") : "—") + "</dd>" +
    "<dt>Số con</dt><dd><span class=\"count\">" + children.length + "</span>" + children.map(personButton).join("") + "</dd>" +
    "</dl>" +
    (person.note ? "<hr><p class=\"note\">" + esc(person.note) + "</p>" : "") +
    '<hr><div class="panel-actions edit-only">' +
    '<button type="button" class="panel-btn" data-action="edit" data-id="' + esc(person.id) + '">' + ICON.pencil + "Xem / sửa thông tin</button>" +
    '<button type="button" class="panel-btn" data-action="add-spouse" data-id="' + esc(person.id) + '">' + ICON.spouse + "Thêm vợ/chồng</button>" +
    '<button type="button" class="panel-btn" data-action="add-child" data-id="' + esc(person.id) + '">' + ICON.child + "Thêm con</button>" +
    (person.external ? "" : '<button type="button" class="panel-btn" data-action="move-cluster" data-id="' + esc(person.id) + '">' + ICON.move + "Chuyển cụm sang nhánh khác</button>") +
    '<button type="button" class="panel-btn danger" data-action="delete" data-id="' + esc(person.id) + '">' + ICON.trash + "Xoá khỏi gia phả</button>" +
    "</div>";
}

function renderChrome(family, layout) {
  const members = family.people.filter((person) => !person.external).length;
  document.getElementById("statMembers").textContent = members + " thành viên";
  document.getElementById("statGens").textContent = (layout.maxGen || 0) + " đời";
  const select = document.getElementById("familySelect");
  const signature = Store.state().families.map((item) => item.id + ":" + item.name).join("|");
  if (select.dataset.sig !== signature) {
    select.innerHTML = Store.state().families.map((item) => '<option value="' + esc(item.id) + '">' + esc(item.name) + "</option>").join("") + '<option value="__new">+ Thêm gia phả mới</option>';
    select.dataset.sig = signature;
  }
  if (select.value !== family.id) select.value = family.id;
  const parents = layout.allUnits.filter((unit) => (layout.childMap.get(unit.id) || []).length);
  const collapsedParents = parents.filter((unit) => layout.collapsed.has(unit.id)).length;
  document.querySelector('[data-action="expand"]').disabled = collapsedParents === 0;
  document.querySelector('[data-action="collapse"]').disabled = parents.length === 0 || collapsedParents === parents.length;
  document.querySelector('[data-action="link-mode"]').classList.toggle("is-active", ui.linkMode);
  document.getElementById("privacyBtn").classList.toggle("is-active", family.isPublic);
  document.getElementById("privacyBtn").setAttribute("aria-pressed", family.isPublic ? "true" : "false");
  document.getElementById("linkBanner").hidden = !ui.linkMode;
  document.getElementById("publicBanner").hidden = !ui.readOnly;
  const guest = ui.readOnly && !Store.writable();
  document.getElementById("publicBannerText").textContent = guest
    ? "Đang xem phần công khai. Nhập mật khẩu để sửa dữ liệu trên máy chủ."
    : "Đang xem phả đồ trực tuyến — chỉ xem, không chỉnh sửa.";
  document.getElementById("publicBannerAction").textContent = guest ? "Nhập mật khẩu" : "Quay lại chỉnh sửa";
  document.getElementById("empty").hidden = layout.units.length > 0;
  document.body.classList.toggle("is-readonly", ui.readOnly);
}

function applyTransform() {
  world.style.transform = "translate(" + ui.tx + "px, " + ui.ty + "px) scale(" + ui.scale + ")";
}

function panelInset() {
  const panel = document.getElementById("panel");
  if (!panel || panel.hidden) return { right: 0, bottom: 0 };
  const rect = panel.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  if (rect.left > canvasRect.left + canvasRect.width * 0.45) return { right: Math.max(0, canvasRect.right - rect.left + 16), bottom: 0 };
  return { right: 0, bottom: Math.max(0, canvasRect.bottom - rect.top + 16) };
}

function fitToView(layout) {
  if (!layout || !layout.units.length) {
    ui.scale = 1;
    ui.tx = 40;
    ui.ty = 40;
    applyTransform();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const inset = panelInset();
  const pad = 56;
  const width = Math.max(layout.maxX - layout.minX, 1);
  const height = Math.max(layout.maxY - layout.minY, 1);
  const availW = Math.max(rect.width - inset.right - 16, 180);
  const availH = Math.max(rect.height - inset.bottom - 16, 180);
  ui.scale = clamp(Math.min(availW / (width + pad), availH / (height + pad)), 0.28, 1.35);
  ui.tx = (availW - width * ui.scale) / 2 - layout.minX * ui.scale + 8;
  ui.ty = (rect.height - inset.bottom - height * ui.scale) / 2 - layout.minY * ui.scale;
  applyTransform();
}

function zoomAt(x, y, factor) {
  const next = clamp(ui.scale * factor, 0.28, 2.4);
  const worldX = (x - ui.tx) / ui.scale;
  const worldY = (y - ui.ty) / ui.scale;
  ui.scale = next;
  ui.tx = x - worldX * next;
  ui.ty = y - worldY * next;
  applyTransform();
}

function zoomBy(factor) {
  const rect = canvas.getBoundingClientRect();
  const inset = panelInset();
  zoomAt((rect.width - inset.right) / 2, (rect.height - inset.bottom) / 2, factor);
  ui.userAdjusted = true;
}

function cardCenter(id) {
  if (!lastLayout) return null;
  for (const unit of lastLayout.units) {
    const index = unit.people.findIndex((person) => person.id === id);
    if (index >= 0) {
      return {
        x: unit.x + index * (CARD_W + SPOUSE_GAP) + CARD_W / 2,
        y: unit.y + CARD_H / 2,
      };
    }
  }
  return null;
}

function panTo(id) {
  const pos = cardCenter(id);
  if (!pos) {
    if (Store.person(id) && Store.person(id).external) toast("Người ngoài tộc chỉ hiện trong hồ sơ, không vẽ trên cây");
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const inset = panelInset();
  ui.tx = (rect.width - inset.right) / 2 - pos.x * ui.scale;
  ui.ty = (rect.height - inset.bottom) / 2 - pos.y * ui.scale;
  ui.userAdjusted = true;
  applyTransform();
  const card = canvas.querySelector('.card[data-id="' + CSS.escape(id) + '"]');
  if (!card) return;
  card.classList.add("pulse");
  setTimeout(() => card.classList.remove("pulse"), 800);
}

function render(opts) {
  const fit = !!(opts && opts.fit) || fitNext;
  fitNext = false;
  try {
    const family = Store.current();
    const layout = layoutFamily(family);
    lastLayout = layout;
    renderTree(layout);
    renderPanel(family, layout);
    renderChrome(family, layout);
    if (fit) fitToView(layout);
    else applyTransform();
  } catch (error) {
    console.error(error);
    toast("Có lỗi khi vẽ phả đồ");
  }
}

function unitKey(person) {
  const byId = new Map(Store.current().people.filter((item) => !item.external).map((item) => [item.id, item]));
  if (!byId.has(person.id)) return person.id;
  const ids = new Set([person.id]);
  (person.spouseIds || []).forEach((id) => { if (byId.has(id)) ids.add(id); });
  return [...ids].sort().join("~");
}

function ancestorKeys(personId) {
  const keys = [];
  const seen = new Set();
  let current = Store.person(personId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    let parent = Store.person(current.fatherId) || Store.person(current.motherId);
    if (!parent) {
      const spouse = (current.spouseIds || []).map((id) => Store.person(id)).find((item) => item && (item.fatherId || item.motherId));
      parent = spouse ? Store.person(spouse.fatherId) || Store.person(spouse.motherId) : null;
    }
    if (!parent) break;
    keys.push(unitKey(parent));
    current = parent;
  }
  return keys;
}

function selectPerson(id, opts) {
  const person = Store.person(id);
  if (!person) return;
  if (ui.linkMode && !ui.readOnly) {
    ui.linkMode = false;
    ui.selectedId = id;
    ui.panelOpen = true;
    persistUi();
    render();
    openLinkParents(id);
    return;
  }
  const family = Store.current();
  const keys = ancestorKeys(id);
  const next = (family.collapsed || []).filter((key) => !keys.includes(key));
  ui.selectedId = id;
  ui.panelOpen = true;
  persistUi();
  if (next.length !== (family.collapsed || []).length) {
    family.collapsed = next;
    Store.emit();
  } else render();
  if (opts && opts.pan) requestAnimationFrame(() => panTo(id));
}

function guardEdit() {
  if (!Store.writable()) {
    openAccessGate();
    return true;
  }
  if (!ui.readOnly) return false;
  toast("Đang ở chế độ xem, không chỉnh sửa được");
  return true;
}

function openModal(opts) {
  const root = document.getElementById("modalRoot");
  root.hidden = false;
  root.innerHTML =
    '<div class="modal-back" id="modalBack"><div class="modal' + (opts.wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
    '<header class="modal-head"><h2>' + esc(opts.title) + '</h2><button type="button" class="icon-x" data-dismiss aria-label="Đóng">×</button></header>' +
    '<form class="modal-form" id="modalForm"><div class="modal-body">' + opts.html + "</div>" +
    (opts.hideFooter ? "" : '<footer class="modal-foot"><button type="button" data-dismiss>Huỷ</button><button type="submit" class="' + (opts.danger ? "danger" : "primary") + '">' + esc(opts.submitLabel || "Lưu") + "</button></footer>") +
    "</form></div></div>";
  const close = () => { root.hidden = true; root.innerHTML = ""; };
  root.querySelector("#modalBack").addEventListener("click", (event) => { if (event.target.id === "modalBack") close(); });
  root.querySelectorAll("[data-dismiss]").forEach((button) => button.addEventListener("click", close));
  root.querySelector("#modalForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const result = opts.onSubmit ? opts.onSubmit(new FormData(event.currentTarget), close) : true;
    Promise.resolve(result).then((value) => {
      if (value !== false) close();
    });
  });
  if (opts.onMount) opts.onMount(root, close);
  const focus = root.querySelector("input, select, textarea, button");
  if (focus) focus.focus();
}

function yearFields(prefix, person) {
  const birth = person && person.birth ? person.birth : "";
  const death = person && person.death ? person.death : "";
  return '<div class="split"><label>Năm sinh<input name="' + prefix + 'Birth" inputmode="numeric" value="' + birth + '" placeholder="1958"></label>' +
    '<label>Năm mất<input name="' + prefix + 'Death" inputmode="numeric" value="' + death + '" placeholder="Để trống nếu còn sống"></label></div>';
}

function readYears(form, prefix) {
  const birth = parseYear(form.get(prefix + "Birth"));
  const death = parseYear(form.get(prefix + "Death"));
  if (birth.error || death.error) return { error: "Năm sinh và năm mất phải là số năm" };
  if (birth.value && death.value && death.value < birth.value) return { error: "Năm mất không thể trước năm sinh" };
  return { birth: birth.value, death: death.value };
}

function parentOptions(person, field) {
  const family = Store.current();
  const blocked = new Set([person.id, ...(person.spouseIds || [])]);
  const stack = [person.id];
  while (stack.length) {
    const id = stack.pop();
    family.people.forEach((item) => {
      if ((item.fatherId === id || item.motherId === id) && !blocked.has(item.id)) {
        blocked.add(item.id);
        stack.push(item.id);
      }
    });
  }
  const current = person[field] || "";
  const options = family.people.filter((item) => !item.external && !blocked.has(item.id));
  return '<option value="">—</option>' + options.map((item) => '<option value="' + esc(item.id) + '"' + (item.id === current ? " selected" : "") + ">" + esc(item.name) + "</option>").join("");
}

function openEdit(id) {
  if (guardEdit()) return;
  const person = Store.person(id);
  if (!person) return;
  openModal({
    title: "Sửa thông tin",
    html:
      '<label>Họ và tên<input name="name" required value="' + esc(person.name) + '"></label>' +
      '<label>Giới tính<select name="gender"><option value="male"' + (person.gender === "male" ? " selected" : "") + '>Nam</option><option value="female"' + (person.gender === "female" ? " selected" : "") + ">Nữ</option></select></label>" +
      yearFields("", person) +
      '<label>Thân phụ trên phả đồ<select name="fatherId">' + parentOptions(person, "fatherId") + "</select></label>" +
      '<label>Thân mẫu trên phả đồ<select name="motherId">' + parentOptions(person, "motherId") + "</select></label>" +
      '<p class="help">Chọn người đã có trên phả đồ sẽ đổi vị trí nhánh. Cha mẹ ngoài tộc dùng nút Liên kết cha/mẹ ngoài tộc.</p>' +
      '<label>Ghi chú<textarea name="note" rows="3">' + esc(person.note || "") + "</textarea></label>",
    onSubmit(form) {
      const years = readYears(form, "");
      if (years.error) { toast(years.error); return false; }
      const result = Store.updatePerson(id, {
        name: form.get("name"),
        gender: form.get("gender"),
        birth: years.birth,
        death: years.death,
        fatherId: form.get("fatherId"),
        motherId: form.get("motherId"),
        note: String(form.get("note") || "").trim(),
      });
      if (!result.ok) { toast(result.error); return false; }
      toast("Đã lưu thông tin");
      return true;
    },
  });
}

function openAddChild(id) {
  if (guardEdit()) return;
  const parent = Store.person(id);
  if (!parent) return;
  const spouses = (parent.spouseIds || []).map((spouseId) => Store.person(spouseId)).filter(Boolean);
  let spouseHtml = '<p class="help">Người này chưa có vợ/chồng trên phả đồ. Con sẽ chỉ gắn một cha hoặc một mẹ.</p>';
  if (spouses.length === 1) spouseHtml = '<p class="help">Cha/mẹ còn lại: <b>' + esc(spouses[0].name) + '</b></p><input type="hidden" name="spouseId" value="' + esc(spouses[0].id) + '">';
  if (spouses.length > 1) {
    spouseHtml = '<label>Người còn lại<select name="spouseId">' + spouses.map((spouse) => '<option value="' + esc(spouse.id) + '">' + esc(spouse.name) + "</option>").join("") + "</select></label>";
  }
  openModal({
    title: "Thêm con",
    submitLabel: "Thêm con",
    html: '<label>Họ và tên<input name="name" required placeholder="Họ và tên"></label>' +
      '<label>Giới tính<select name="gender"><option value="male">Nam</option><option value="female">Nữ</option></select></label>' +
      yearFields("", null) + spouseHtml,
    onSubmit(form) {
      const years = readYears(form, "");
      if (years.error) { toast(years.error); return false; }
      const result = Store.addChild(id, form.get("spouseId"), {
        name: form.get("name"),
        gender: form.get("gender"),
        birth: years.birth,
        death: years.death,
      });
      if (!result.ok) { toast(result.error); return false; }
      selectPerson(result.id, { pan: true });
      toast("Đã thêm con");
      return true;
    },
  });
}

function openAddSpouse(id) {
  if (guardEdit()) return;
  const person = Store.person(id);
  if (!person) return;
  const gender = person.gender === "female" ? "male" : "female";
  openModal({
    title: "Thêm vợ/chồng",
    submitLabel: "Thêm",
    html: '<p class="help">Thêm vợ hoặc chồng đứng cạnh <b>' + esc(person.name) + "</b> trên phả đồ.</p>" +
      '<label>Họ và tên<input name="name" required></label>' +
      '<label>Giới tính<select name="gender"><option value="male"' + (gender === "male" ? " selected" : "") + '>Nam</option><option value="female"' + (gender === "female" ? " selected" : "") + ">Nữ</option></select></label>" +
      yearFields("", null),
    onSubmit(form) {
      const years = readYears(form, "");
      if (years.error) { toast(years.error); return false; }
      const result = Store.addSpouse(id, {
        name: form.get("name"),
        gender: form.get("gender"),
        birth: years.birth,
        death: years.death,
      });
      if (!result.ok) { toast(result.error); return false; }
      selectPerson(result.id, { pan: true });
      toast("Đã thêm vợ/chồng");
      return true;
    },
  });
}

function coupleSlots(people) {
  let fatherId = null;
  let motherId = null;
  people.forEach((person) => {
    if (person.gender === "female") motherId = motherId || person.id;
    else fatherId = fatherId || person.id;
  });
  return { fatherId, motherId };
}

function openMoveCluster(id) {
  if (guardEdit()) return;
  const family = Store.current();
  const layout = lastLayout || layoutFamily(family);
  const units = layout.allUnits || [];
  const unit = units.find((item) => item.people.some((person) => person.id === id));
  if (!unit) return;
  const blocked = new Set();
  const stack = [unit.id];
  while (stack.length) {
    const unitId = stack.pop();
    if (blocked.has(unitId)) continue;
    blocked.add(unitId);
    (layout.childMap.get(unitId) || []).forEach((kid) => stack.push(kid.id));
  }
  const names = unit.people.map((person) => person.name).join(" và ");
  let descendants = 0;
  blocked.forEach((unitId) => {
    if (unitId === unit.id) return;
    const found = units.find((item) => item.id === unitId);
    if (found) descendants += found.people.length;
  });
  const anchor = family.people.find((person) => person.id === unit.anchorId) || unit.people[0];
  const father = family.people.find((person) => person.id === anchor.fatherId);
  const mother = family.people.find((person) => person.id === anchor.motherId);
  const currentLabel = [father, mother].filter(Boolean).map((person) => person.name).join(" và ") || "đầu phả đồ";
  const choices = units.filter((item) => !blocked.has(item.id)).map((item) => {
    const slots = coupleSlots(item.people);
    const label = item.people.map((person) => person.name).join(" và ");
    const gen = item.generation || layout.genOf.get(item.people[0].id) || 99;
    return { value: (slots.fatherId || "") + "|" + (slots.motherId || ""), label: "Đời " + gen + " — " + label, gen, name: label };
  }).sort((a, b) => a.gen - b.gen || a.name.localeCompare(b.name, "vi"));
  const options = '<option value="|">Đưa lên đầu phả đồ, không gắn cha mẹ</option>' +
    choices.map((choice) => '<option value="' + esc(choice.value) + '">' + esc(choice.label) + "</option>").join("");
  const descendantText = descendants ? " Cả " + descendants + " người con cháu bên dưới đi cùng." : "";
  openModal({
    title: "Chuyển cụm sang nhánh khác",
    submitLabel: "Chuyển cụm",
    html: '<p class="help">Cụm <b>' + esc(names) + "</b> đang nằm dưới <b>" + esc(currentLabel) + "</b>." + descendantText + " Chọn cha mẹ mới. Tên, năm sinh, vợ chồng và con được giữ nguyên.</p>" +
      '<label>Chuyển xuống dưới<select name="dest">' + options + "</select></label>",
    onSubmit(form) {
      const [fatherId, motherId] = String(form.get("dest") || "|").split("|");
      const result = Store.moveCluster(unit.anchorId, unit.people.map((person) => person.id), fatherId, motherId);
      if (!result.ok) { toast(result.error); return false; }
      selectPerson(result.id, { pan: true });
      toast("Đã chuyển cụm");
      return true;
    },
  });
}

function openDelete(id) {
  if (guardEdit()) return;
  const person = Store.person(id);
  if (!person) return;
  openModal({
    title: "Xoá khỏi gia phả",
    submitLabel: "Xoá",
    danger: true,
    html: "<p>Xoá <b>" + esc(person.name) + "</b> khỏi gia phả? Vợ/chồng và con vẫn được giữ, chỉ bỏ liên kết với người này.</p>",
    onSubmit() {
      if (ui.selectedId === id) {
        ui.selectedId = null;
        ui.panelOpen = false;
        persistUi();
      }
      Store.deletePerson(id);
      toast("Đã xoá khỏi gia phả");
      return true;
    },
  });
}

function topOfLine(start) {
  const seen = new Set();
  let current = start;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = Store.person(current.fatherId) || Store.person(current.motherId);
    if (parent) { current = parent; continue; }
    const spouse = (current.spouseIds || []).map((id) => Store.person(id)).find((item) => item && !seen.has(item.id) && (item.fatherId || item.motherId));
    if (spouse) { current = spouse; continue; }
    return current;
  }
  return current;
}

function ancestorForm(label) {
  return '<div class="stack"><strong>' + label + '</strong><label>Họ và tên<input name="' + (label === "Thân phụ" ? "fatherName" : "motherName") + '" placeholder="' + label + '"></label>' +
    '<div class="split"><label>Năm sinh<input name="' + (label === "Thân phụ" ? "fatherBirth" : "motherBirth") + '" inputmode="numeric"></label><label>Năm mất<input name="' + (label === "Thân phụ" ? "fatherDeath" : "motherDeath") + '" inputmode="numeric"></label></div></div>';
}

function openAddAncestor() {
  if (guardEdit()) return;
  const family = Store.current();
  const selected = Store.person(ui.selectedId);
  const start = selected && !selected.external ? selected : family.people.find((person) => !person.external);
  const target = start ? topOfLine(start) : null;
  openModal({
    title: target ? "Thêm tổ tiên" : "Tổ tiên đầu tiên",
    submitLabel: "Thêm",
    html: '<p class="help">' + (target
      ? "Thêm cha mẹ cho <b>" + esc(target.name) + "</b>, người đứng trên cùng của nhánh này. Cả nhánh sẽ hạ xuống một đời."
      : "Tạo cặp tổ tiên đầu tiên của gia phả. Có thể nhập một người nếu chỉ biết cha hoặc mẹ.") + "</p>" +
      ancestorForm("Thân phụ") + ancestorForm("Thân mẫu"),
    onSubmit(form) {
      const fatherYears = readYears(form, "father");
      const motherYears = readYears(form, "mother");
      if (fatherYears.error) { toast(fatherYears.error); return false; }
      if (motherYears.error) { toast(motherYears.error); return false; }
      const result = Store.addAncestors(target ? target.id : null, {
        name: form.get("fatherName"),
        birth: fatherYears.birth,
        death: fatherYears.death,
      }, {
        name: form.get("motherName"),
        birth: motherYears.birth,
        death: motherYears.death,
      });
      if (!result.ok) { toast(result.error); return false; }
      fitNext = true;
      selectPerson(result.id);
      toast("Đã thêm tổ tiên");
      return true;
    },
  });
}

function linkSelect(name, currentId, people) {
  return '<select name="' + name + '"><option value="">— Không gắn —</option>' +
    people.map((person) => '<option value="' + esc(person.id) + '"' + (person.id === currentId ? " selected" : "") + ">" + esc(person.name) + (person.external ? " (ngoài tộc)" : "") + "</option>").join("") +
    "</select>";
}

function openLinkParents(id) {
  if (guardEdit()) return;
  const person = Store.person(id);
  if (!person) return;
  const people = Store.current().people.filter((item) => item.id !== id);
  openModal({
    title: "Cha mẹ ngoài tộc",
    submitLabel: "Gắn liên kết",
    html: '<p class="help">Gắn cha mẹ cho <b>' + esc(person.name) + "</b>. Người ngoài tộc hiện trong hồ sơ và danh sách, không kéo nhánh sang cây khác. Nhập tên mới nếu họ chưa có trong gia phả.</p>" +
      '<label>Thân phụ đã có' + linkSelect("fatherId", person.externalFatherId, people) + "</label>" +
      '<label>Hoặc tên cha mới<input name="fatherName" placeholder="Để trống nếu chọn ở trên"></label>' +
      '<label>Thân mẫu đã có' + linkSelect("motherId", person.externalMotherId, people) + "</label>" +
      '<label>Hoặc tên mẹ mới<input name="motherName" placeholder="Để trống nếu chọn ở trên"></label>',
    onSubmit(form) {
      const result = Store.linkExternal(id, {
        fatherId: form.get("fatherId"),
        fatherName: form.get("fatherName"),
        motherId: form.get("motherId"),
        motherName: form.get("motherName"),
      });
      if (!result.ok) { toast(result.error); return false; }
      toast("Đã cập nhật cha mẹ ngoài tộc");
      return true;
    },
  });
}

function openMembers() {
  const family = Store.current();
  const layout = lastLayout || layoutFamily(family);
  const rows = family.people.slice().sort((a, b) => {
    const ga = a.external ? 99 : (layout.genOf.get(a.id) || 98);
    const gb = b.external ? 99 : (layout.genOf.get(b.id) || 98);
    if (ga !== gb) return ga - gb;
    return (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, "vi");
  }).map((person) => {
    const spouses = (person.spouseIds || []).map((id) => family.people.find((item) => item.id === id)).filter(Boolean).map((item) => item.name).join(", ") || "—";
    const childCount = family.people.filter((item) => item.fatherId === person.id || item.motherId === person.id).length;
    const generation = person.external ? "Ngoài tộc" : (layout.genOf.get(person.id) || "—");
    return "<tr><td><button type=\"button\" class=\"name-btn\" data-pick=\"" + esc(person.id) + "\">" + esc(person.name) + "</button>" +
      (person.external ? '<span class="tag">Ngoài tộc</span>' : "") + "</td><td>" + genderLabel(person.gender) + "</td><td>" + generation + "</td><td>" +
      esc(yearsText(person) || "—") + "</td><td>" + esc(spouses) + "</td><td>" + childCount + "</td><td>" +
      (ui.readOnly ? "" : '<button type="button" class="linkish" data-edit="' + esc(person.id) + '">Sửa</button>') + "</td></tr>";
  }).join("");
  openModal({
    title: "Danh sách thành viên",
    wide: true,
    hideFooter: true,
    html: '<div class="member-tools"><label>Tên gia phả<input id="familyNameInput" value="' + esc(family.name) + '"' + (ui.readOnly ? " readonly" : "") + '></label>' +
      '<label>Lọc<input id="memberFilter" placeholder="Tên thành viên"></label></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Giới</th><th>Đời</th><th>Sinh – mất</th><th>Vợ / chồng</th><th>Con</th><th></th></tr></thead><tbody id="memberBody">' +
      rows + "</tbody></table></div>" +
      '<div class="row-actions edit-only"><button type="button" class="text-btn" id="restoreDemo">Khôi phục dữ liệu mẫu</button>' +
      (Store.state().families.length > 1 ? '<button type="button" class="text-btn danger" id="deleteFamily">Xoá gia phả này</button>' : "") +
      (Store.authRequired() ? '<button type="button" class="text-btn" id="logoutBtn">Đăng xuất</button>' : "") +
      "</div>",
    onSubmit() { return false; },
    onMount(root, close) {
      const filter = root.querySelector("#memberFilter");
      filter.addEventListener("input", () => {
        const query = norm(filter.value);
        root.querySelectorAll("#memberBody tr").forEach((row) => {
          row.hidden = query && !norm(row.textContent).includes(query);
        });
      });
      const nameInput = root.querySelector("#familyNameInput");
      if (!ui.readOnly) {
        nameInput.addEventListener("change", () => {
          const result = Store.renameFamily(nameInput.value);
          if (!result.ok) toast(result.error);
          else toast("Đã đổi tên gia phả");
        });
      }
      root.addEventListener("click", (event) => {
        const pick = event.target.closest("[data-pick]");
        const edit = event.target.closest("[data-edit]");
        if (pick) { close(); selectPerson(pick.dataset.pick, { pan: true }); }
        if (edit) { close(); openEdit(edit.dataset.edit); }
        if (event.target.id === "logoutBtn") {
          close();
          Store.logout();
          start();
          toast("Đã đăng xuất. Phần công khai vẫn xem được.");
        }
        if (event.target.id === "restoreDemo") {
          close();
          openModal({
            title: "Khôi phục dữ liệu mẫu",
            submitLabel: "Khôi phục",
            danger: true,
            html: "<p>Thay toàn bộ gia phả trên máy chủ bằng hai gia phả mẫu họ Đỗ và họ Lê.</p>",
            onSubmit() { restoreDemo(); return true; },
          });
        }
        if (event.target.id === "deleteFamily") {
          const familyId = Store.current().id;
          close();
          openModal({
            title: "Xoá gia phả",
            submitLabel: "Xoá",
            danger: true,
            html: "<p>Xoá cả gia phả này khỏi máy? Thao tác không hoàn tác được.</p>",
            onSubmit() {
              const result = Store.deleteFamily(familyId);
              if (!result.ok) { toast(result.error); return false; }
              const next = Store.current();
              ui.selectedId = defaultSelection(next);
              ui.panelOpen = !!ui.selectedId;
              ui.readOnly = false;
              document.body.classList.remove("is-readonly");
              fitNext = true;
              render({ fit: true });
              toast("Đã xoá gia phả");
              return true;
            },
          });
        }
      });
    },
  });
}

function openNewFamily() {
  if (guardEdit()) return;
  openModal({
    title: "Thêm gia phả",
    submitLabel: "Tạo",
    html: '<label>Tên gia phả<input name="name" required placeholder="Gia phả họ Nguyễn"></label>',
    onSubmit(form) {
      const name = String(form.get("name") || "").trim();
      if (!name) { toast("Nhập tên gia phả"); return false; }
      const id = Store.addFamily(name);
      switchFamily(id);
      toast("Đã tạo gia phả");
      setTimeout(openAddAncestor, 0);
      return true;
    },
  });
}

function switchFamily(id) {
  ui.readOnly = false;
  ui.linkMode = false;
  document.body.classList.remove("is-readonly");
  Store.state().currentId = id;
  const family = Store.current();
  ui.selectedId = defaultSelection(family);
  ui.panelOpen = !!ui.selectedId;
  ui.query = "";
  searchInput.value = "";
  searchResults.hidden = true;
  ui.userAdjusted = false;
  fitNext = true;
  persistUi();
  Store.emit();
}

function togglePrivacy() {
  const next = !Store.current().isPublic;
  if (!next && ui.readOnly) {
    ui.readOnly = false;
    document.body.classList.remove("is-readonly");
  }
  Store.updateFamily({ isPublic: next });
  toast(next ? "Đã chuyển sang công khai" : "Đã chuyển sang riêng tư");
}

function enterOnline() {
  if (!Store.current().isPublic) {
    toast("Gia phả đang để riêng tư. Bấm “Riêng tư / Công khai” để mở xem trực tuyến.");
    return;
  }
  ui.readOnly = true;
  ui.linkMode = false;
  render();
  toast("Đang xem phả đồ trực tuyến");
}

function exitReadOnly() {
  if (!Store.writable()) {
    openAccessGate();
    return;
  }
  ui.readOnly = false;
  document.body.classList.remove("is-readonly");
  render();
}

function updateSync(status) {
  const el = document.getElementById("syncStatus");
  const labels = {
    local: "Lưu trên máy này",
    saving: "Đang lưu lên máy chủ…",
    saved: "Đã lưu trên máy chủ",
    view: "Đang xem công khai",
    error: "Chưa lưu được lên máy chủ",
    unauthorized: "Cần mật khẩu để sửa",
  };
  el.textContent = labels[status] || "Đang kết nối…";
  el.classList.toggle("warn", status === "error" || status === "unauthorized");
}

function openAccessGate() {
  openModal({
    title: "Mật khẩu gia phả",
    submitLabel: "Vào sửa",
    html: "<p class=\"help\">Mật khẩu do người triển khai đặt khi chạy máy chủ. Ai có mật khẩu thì sửa được gia phả trên mạng.</p><label>Mật khẩu<input name=\"key\" type=\"password\" required autocomplete=\"current-password\"></label>",
    onSubmit(form) {
      const key = String(form.get("key") || "");
      return Store.login(key).then((ok) => {
        if (!ok) {
          toast("Mật khẩu không đúng");
          return false;
        }
        toast("Đã mở quyền sửa");
        ui.readOnly = false;
        document.body.classList.remove("is-readonly");
        return start().then(() => true);
      });
    },
  });
}

function restoreDemo() {
  ui.readOnly = false;
  ui.linkMode = false;
  ui.query = "";
  searchInput.value = "";
  document.body.classList.remove("is-readonly");
  Store.reset();
  ui.selectedId = "do-thao";
  ui.panelOpen = true;
  ui.userAdjusted = false;
  fitNext = true;
  persistUi();
  render({ fit: true });
  toast("Đã khôi phục dữ liệu mẫu");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  });
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

async function exportImage() {
  const layout = lastLayout;
  const family = Store.current();
  if (!layout || !layout.units.length) { toast("Chưa có ai trên phả đồ để xuất"); return; }
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const pad = 56;
  const width = Math.max(layout.maxX - layout.minX, CARD_W) + pad * 2;
  const height = Math.max(layout.maxY - layout.minY, CARD_H) + pad * 2 + 36;
  const pixel = 2;
  const board = document.createElement("canvas");
  board.width = Math.ceil(width * pixel);
  board.height = Math.ceil(height * pixel);
  const ctx = board.getContext("2d");
  ctx.scale(pixel, pixel);
  ctx.fillStyle = "#f4ead6";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#2f6a45";
  ctx.font = '700 22px "Playfair Display", Georgia, serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(family.name, pad, 18);
  ctx.save();
  ctx.translate(pad - layout.minX, pad + 28 - layout.minY);
  ctx.strokeStyle = "#c4b08a";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  connectorModel(layout).forEach((item) => item.segs.forEach((seg) => {
    ctx.moveTo(seg[0], seg[1]);
    ctx.lineTo(seg[2], seg[3]);
  }));
  ctx.stroke();
  layout.units.forEach((unit) => {
    unit.people.forEach((person, index) => {
      const x = unit.x + index * (CARD_W + SPOUSE_GAP);
      const y = unit.y;
      roundRect(ctx, x, y, CARD_W, CARD_H, 8);
      ctx.fillStyle = person.gender === "female" ? "#f8d4e3" : "#d5eef8";
      ctx.fill();
      ctx.lineWidth = person.id === ui.selectedId ? 3 : 1.2;
      ctx.strokeStyle = person.id === ui.selectedId ? "#2f9d4f" : person.gender === "female" ? "#e7a8c0" : "#8ec3dc";
      ctx.stroke();
      roundRect(ctx, x + CARD_W - 28, y + 8, 18, 18, 4);
      ctx.fillStyle = "#3e4c5a";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = '700 11px "Be Vietnam Pro", "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(unit.generation), x + CARD_W - 19, y + 17);
      ctx.beginPath();
      ctx.arc(x + CARD_W / 2, y + 52, 20, 0, Math.PI * 2);
      ctx.fillStyle = "#e7edf1";
      ctx.fill();
      ctx.fillStyle = "#243038";
      ctx.font = '700 13px "Be Vietnam Pro", "Segoe UI", sans-serif';
      ctx.textBaseline = "top";
      wrapText(ctx, person.name, CARD_W - 16).forEach((line, lineIndex) => ctx.fillText(line, x + CARD_W / 2, y + 80 + lineIndex * 16));
      ctx.fillStyle = "#5d6c78";
      ctx.font = '500 12px "Be Vietnam Pro", "Segoe UI", sans-serif';
      ctx.fillText(yearsText(person), x + CARD_W / 2, y + 128);
    });
  });
  ctx.restore();
  const link = document.createElement("a");
  link.href = board.toDataURL("image/png");
  link.download = (norm(family.name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pha-do") + ".png";
  link.click();
  toast("Đã tải ảnh phả đồ");
}

function showSearchList() {
  const query = ui.query;
  if (!query) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
    return;
  }
  const people = Store.current().people.filter((person) => norm(person.name).includes(norm(query)));
  searchResults.hidden = false;
  if (!people.length) {
    searchResults.innerHTML = '<div class="search-empty">Không thấy người nào</div>';
    return;
  }
  searchResults.innerHTML = people.slice(0, 8).map((person) => '<button type="button" data-pick="' + esc(person.id) + '">' + esc(person.name) + "<small>" + esc(yearsText(person) || (person.external ? "Ngoài tộc" : "")) + "</small></button>").join("");
}

function collapseAll() {
  const family = Store.current();
  const layout = layoutFamily(family);
  family.collapsed = layout.allUnits.filter((unit) => (layout.childMap.get(unit.id) || []).length).map((unit) => unit.id);
  ui.userAdjusted = false;
  fitNext = true;
  Store.emit();
}

function expandAll() {
  Store.current().collapsed = [];
  ui.userAdjusted = false;
  fitNext = true;
  Store.emit();
}

function toggleUnit(id) {
  const family = Store.current();
  const set = new Set(family.collapsed || []);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  family.collapsed = [...set];
  Store.emit();
}

document.body.addEventListener("click", (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (actionEl && !actionEl.closest("#modalRoot")) {
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id || ui.selectedId;
    if (action === "zoom-in") zoomBy(1.12);
    else if (action === "zoom-out") zoomBy(1 / 1.12);
    else if (action === "fit") { ui.userAdjusted = false; fitToView(lastLayout); }
    else if (action === "expand") expandAll();
    else if (action === "collapse") collapseAll();
    else if (action === "link-mode") {
      if (guardEdit()) return;
      ui.linkMode = !ui.linkMode;
      render();
      if (ui.linkMode) toast("Chọn một người trên phả đồ để gắn cha mẹ ngoài tộc");
    } else if (action === "export") exportImage();
    else if (action === "add-ancestor") openAddAncestor();
    else if (action === "members") openMembers();
    else if (action === "privacy") togglePrivacy();
    else if (action === "online") enterOnline();
    else if (action === "exit-online") exitReadOnly();
    else if (action === "edit") openEdit(id);
    else if (action === "add-spouse") openAddSpouse(id);
    else if (action === "add-child") openAddChild(id);
    else if (action === "move-cluster") openMoveCluster(id);
    else if (action === "delete") openDelete(id);
    else if (action === "select") selectPerson(id, { pan: true });
    else if (action === "close-panel") {
      ui.panelOpen = false;
      ui.selectedId = null;
      persistUi();
      render();
    }
  }
  if (!event.target.closest(".search")) searchResults.hidden = true;
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".joint")) return;
  drag = {
    x: event.clientX,
    y: event.clientY,
    tx: ui.tx,
    ty: ui.ty,
    moved: false,
    card: event.target.closest(".card"),
  };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (Math.hypot(dx, dy) > 4) {
    drag.moved = true;
    canvas.classList.add("is-panning");
    ui.userAdjusted = true;
  }
  if (!drag.moved) return;
  ui.tx = drag.tx + dx;
  ui.ty = drag.ty + dy;
  applyTransform();
});

canvas.addEventListener("pointerup", () => {
  if (!drag) return;
  const moved = drag.moved;
  const card = drag.card;
  drag = null;
  canvas.classList.remove("is-panning");
  if (moved) return;
  if (card) selectPerson(card.dataset.id);
  else if (ui.panelOpen || ui.selectedId) {
    ui.panelOpen = false;
    ui.selectedId = null;
    persistUi();
    render();
  }
});

canvas.addEventListener("pointercancel", () => {
  drag = null;
  canvas.classList.remove("is-panning");
});

canvas.addEventListener("click", (event) => {
  const joint = event.target.closest(".joint");
  if (!joint) return;
  event.stopPropagation();
  toggleUnit(joint.dataset.unit);
});

canvas.addEventListener("dblclick", (event) => {
  const card = event.target.closest(".card");
  if (!card || ui.readOnly) return;
  openEdit(card.dataset.id);
});

canvas.addEventListener("keydown", (event) => {
  const card = event.target.closest(".card");
  if (!card) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectPerson(card.dataset.id);
  }
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.08 : 0.92);
  ui.userAdjusted = true;
}, { passive: false });

document.getElementById("familySelect").addEventListener("change", (event) => {
  if (event.target.value === "__new") {
    event.target.value = Store.current().id;
    openNewFamily();
    return;
  }
  switchFamily(event.target.value);
});

searchInput.addEventListener("input", () => {
  ui.query = searchInput.value.trim();
  render();
  showSearchList();
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const first = searchResults.querySelector("[data-pick]");
  if (!first) return;
  event.preventDefault();
  searchResults.hidden = true;
  selectPerson(first.dataset.pick, { pan: true });
});

searchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-pick]");
  if (!button) return;
  searchResults.hidden = true;
  selectPerson(button.dataset.pick, { pan: true });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const modal = document.getElementById("modalRoot");
  if (!modal.hidden) {
    modal.hidden = true;
    modal.innerHTML = "";
    return;
  }
  if (ui.linkMode) { ui.linkMode = false; render(); return; }
  if (ui.readOnly) { exitReadOnly(); return; }
  if (ui.panelOpen) {
    ui.panelOpen = false;
    ui.selectedId = null;
    persistUi();
    render();
  }
});

window.addEventListener("resize", () => {
  if (!ui.userAdjusted) fitToView(lastLayout);
});

let booted = false;

async function start() {
  const result = await Store.hydrate();
  const families = Store.state().families;
  if (result.mode === "view" && !families.length) {
    ui.readOnly = true;
    document.body.classList.add("is-readonly");
    if (!booted) {
      Store.subscribe(() => render());
      booted = true;
    }
    render({ fit: true });
    openAccessGate();
    return;
  }
  if (result.mode === "view") {
    ui.readOnly = true;
    document.body.classList.add("is-readonly");
  } else if (Store.writable()) {
    ui.readOnly = false;
    document.body.classList.remove("is-readonly");
  }
  bootSelection();
  if (!booted) {
    Store.subscribe(() => render());
    booted = true;
  }
  ui.userAdjusted = false;
  render({ fit: true });
}

Store.onStatus(updateSync);
document.getElementById("syncStatus").addEventListener("click", () => {
  if (Store.authRequired() && !Store.writable()) openAccessGate();
});
start();
window.addEventListener("load", () => { if (!ui.userAdjusted && lastLayout) fitToView(lastLayout); });
