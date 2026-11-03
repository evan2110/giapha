const Store = (() => {
  const KEY = "giapha.v1";
  let state;
  const listeners = new Set();

  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }

  function datePart(value, max) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > max) return null;
    return number;
  }

  function blankPerson(partial) {
    const gender = partial.gender === "female" ? "female" : "male";
    const person = {
      id: partial.id || uid("p"),
      name: String(partial.name || "").trim(),
      gender,
      birth: partial.birth ?? null,
      birthMonth: datePart(partial.birthMonth, 12),
      birthDay: datePart(partial.birthDay, 31),
      death: partial.death ?? null,
      fatherId: partial.fatherId || null,
      motherId: partial.motherId || null,
      externalFatherId: partial.externalFatherId || null,
      externalMotherId: partial.externalMotherId || null,
      spouseIds: Array.isArray(partial.spouseIds) ? partial.spouseIds.slice() : [],
      order: partial.order ?? null,
      note: partial.note || "",
      bio: typeof partial.bio === "string" ? partial.bio.replace(/\r\n/g, "\n").trim().slice(0, 8000) : "",
      external: !!partial.external,
    };
    if (!person.birth || !person.birthMonth) person.birthDay = null;
    if (!person.birth) person.birthMonth = null;
    return person;
  }

  function seed() {
    return {
      version: 1,
      currentId: "do",
      families: [
        {
          id: "do",
          name: "Gia phả họ Đỗ",
          isPublic: true,
          collapsed: [],
          people: [
            blankPerson({ id: "do-toan", name: "Đỗ Văn Toan", gender: "male", birth: 1925, death: 1998, spouseIds: ["do-mia"] }),
            blankPerson({ id: "do-mia", name: "Nguyễn Thị Mía", gender: "female", birth: 1920, death: 2005, spouseIds: ["do-toan"] }),
            blankPerson({ id: "do-my", name: "Đỗ Văn Mỹ", gender: "male", birth: 1990, death: 2015, fatherId: "do-toan", motherId: "do-mia", spouseIds: ["do-mui"], order: 1 }),
            blankPerson({ id: "do-mui", name: "Nguyễn Thị Mùi", gender: "female", birth: 1993, spouseIds: ["do-my"] }),
            blankPerson({ id: "do-hai", name: "Đỗ Văn Hải", gender: "male", birth: 1955, fatherId: "do-toan", motherId: "do-mia", spouseIds: ["do-thao"], order: 2 }),
            blankPerson({ id: "do-thao", name: "Nguyễn Thị Thảo", gender: "female", birth: 1958, spouseIds: ["do-hai"] }),
            blankPerson({ id: "do-khang", name: "Đỗ Minh Khang", gender: "male", birth: 2010, fatherId: "do-my", motherId: "do-mui", order: 1 }),
            blankPerson({ id: "do-ngoc", name: "Đỗ Thị Ngọc", gender: "female", birth: 2012, fatherId: "do-my", motherId: "do-mui", order: 2 }),
            blankPerson({ id: "do-quan", name: "Đỗ Minh Quân", gender: "male", birth: 2014, fatherId: "do-my", motherId: "do-mui", order: 3 }),
            blankPerson({ id: "do-nam", name: "Đỗ Văn Nam", gender: "male", birth: 1978, fatherId: "do-hai", motherId: "do-thao", order: 1 }),
            blankPerson({ id: "do-hoa", name: "Đỗ Thị Hoa", gender: "female", birth: 1981, fatherId: "do-hai", motherId: "do-thao", order: 2 }),
            blankPerson({ id: "do-lan", name: "Đỗ Thị Lan", gender: "female", birth: 1985, fatherId: "do-hai", motherId: "do-thao", order: 3 }),
          ],
        },
        {
          id: "le",
          name: "Gia phả họ Lê",
          isPublic: false,
          collapsed: [],
          people: [
            blankPerson({ id: "le-to", name: "Lê Văn Tổ", gender: "male", birth: 1900, death: 1972, spouseIds: ["le-sen"] }),
            blankPerson({ id: "le-sen", name: "Trần Thị Sen", gender: "female", birth: 1905, death: 1990, spouseIds: ["le-to"] }),
            blankPerson({ id: "le-binh", name: "Lê Văn Bình", gender: "male", birth: 1932, death: 2015, fatherId: "le-to", motherId: "le-sen", spouseIds: ["le-mai"], order: 1 }),
            blankPerson({ id: "le-mai", name: "Phạm Thị Mai", gender: "female", birth: 1936, spouseIds: ["le-binh"] }),
            blankPerson({ id: "le-ha", name: "Lê Thị Hà", gender: "female", birth: 1960, fatherId: "le-binh", motherId: "le-mai", order: 1 }),
            blankPerson({ id: "le-duc", name: "Lê Văn Đức", gender: "male", birth: 1964, fatherId: "le-binh", motherId: "le-mai", order: 2 }),
          ],
        },
      ],
    };
  }

  function isDescendant(people, ancestorId, maybeId) {
    const stack = [ancestorId];
    const seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      for (const person of people) {
        if (person.fatherId === id || person.motherId === id) {
          if (person.id === maybeId) return true;
          stack.push(person.id);
        }
      }
    }
    return false;
  }

  function tidyIntro(html, familyId) {
  let next = String(html || "");
  const id = String(familyId || "");
  if (id && next.startsWith(id)) {
    const rest = next.slice(id.length).replace(/^[\s\u0000]+/, "");
    if (rest.startsWith("<")) next = rest;
  }
  next = next.replace(/^(?:<br\s*\/?>|\s)+/gi, "");
  next = next.replace(/^<p>((?:\s|&nbsp;|&#160;)+)/i, "<p>");
  return next;
}

function repairAlbum(family, key) {
    if (!Array.isArray(family[key])) {
      family[key] = [];
      extrasChanged = true;
      return;
    }
    const photos = family[key].filter(photoOk).slice(0, 24);
    if (photos.length !== family[key].length) extrasChanged = true;
    family[key] = photos;
  }

function photoOk(photo) {
    return photo && typeof photo.id === "string" && photo.id.length < 40 && typeof photo.title === "string" && photo.title.length <= 120 && typeof photo.src === "string" && photo.src.startsWith("data:image/jpeg;base64,") && photo.src.length < 400000;
  }

  function repairFamily(family) {
    family.name = family.name || "Gia phả mới";
    family.isPublic = !!family.isPublic;
    family.collapsed = Array.isArray(family.collapsed) ? family.collapsed : [];
    if (typeof family.intro !== "string") {
      family.intro = typeof defaultIntro === "function" ? defaultIntro(family) : "";
      extrasChanged = true;
    }
    const tidied = tidyIntro(family.intro, family.id);
    if (tidied !== family.intro) {
      family.intro = tidied;
      extrasChanged = true;
    }
    if (family.intro.length > 200000) family.intro = family.intro.slice(0, 200000);
    repairAlbum(family, "photos");
    repairAlbum(family, "tombs");
    if (typeof family.shrineMap !== "string") family.shrineMap = "";
    else if (family.shrineMap && !/^https:\/\/(maps\.google\.com\/maps\?|www\.google\.com\/maps\/embed\?)/.test(family.shrineMap)) {
      family.shrineMap = "";
      extrasChanged = true;
    }
    family.people = (family.people || []).map((person) => blankPerson(person));
    const ids = new Set(family.people.map((person) => person.id));
    for (const person of family.people) {
      if (person.fatherId && !ids.has(person.fatherId)) person.fatherId = null;
      if (person.motherId && !ids.has(person.motherId)) person.motherId = null;
      if (person.externalFatherId && !ids.has(person.externalFatherId)) person.externalFatherId = null;
      if (person.externalMotherId && !ids.has(person.externalMotherId)) person.externalMotherId = null;
      person.spouseIds = [...new Set(person.spouseIds.filter((id) => ids.has(id) && id !== person.id))];
    }
    for (const person of family.people) {
      for (const spouseId of person.spouseIds) {
        const spouse = family.people.find((item) => item.id === spouseId);
        if (spouse && !spouse.spouseIds.includes(person.id)) spouse.spouseIds.push(person.id);
      }
    }
    return family;
  }

  let mode = "local";
  let extrasChanged = false;
  let authRequired = false;
  let statusHandler = () => {};
  let pushTimer = 0;
  const ACCESS_KEY = "giapha.access";

  function writable() {
    return mode === "local" || mode === "edit";
  }

  function accessKey() {
    try { return localStorage.getItem(ACCESS_KEY) || ""; } catch { return ""; }
  }

  function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    const key = accessKey();
    if (key) headers.Authorization = "Bearer " + key;
    return headers;
  }

  function setStatus(status) {
    statusHandler(status, mode);
  }

  function applyState(next, allowSeed) {
    extrasChanged = false;
    state = next && typeof next === "object" ? next : null;
    if (!state || !Array.isArray(state.families)) state = allowSeed ? seed() : { version: 1, currentId: null, families: [] };
    if (!state.families.length && allowSeed) state = seed();
    state.families.forEach(repairFamily);
    if (state.families.length && !state.families.some((family) => family.id === state.currentId)) state.currentId = state.families[0].id;
  }

  function loadFromLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      applyState(raw ? JSON.parse(raw) : seed(), true);
    } catch {
      applyState(seed(), true);
    }
  }

  function saveLocal() {
    if (mode === "view") return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Bộ nhớ trình duyệt có thể bị chặn. */ }
  }

  async function pushNow() {
    if (mode !== "edit") return;
    setStatus("saving");
    const response = await fetch("/api/state", { method: "PUT", headers: authHeaders(), body: JSON.stringify(state) });
    if (response.status === 401) {
      mode = "view";
      setStatus("unauthorized");
      return;
    }
    if (!response.ok) throw new Error("save failed");
    setStatus("saved");
  }

  function schedulePush() {
    if (mode !== "edit") return;
    setStatus("saving");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushNow().catch(() => setStatus("error")); }, 300);
  }

  function load() {
    loadFromLocal();
  }

  function save() {
    saveLocal();
    schedulePush();
  }

  async function hydrate() {
    if (new URLSearchParams(location.search).has("reset")) {
      try {
        localStorage.removeItem(KEY);
        sessionStorage.removeItem("giapha-ui");
      } catch { /* bỏ qua */ }
      history.replaceState(null, "", location.pathname);
    }
    let payload;
    try {
      const response = await fetch("/api/state", { headers: authHeaders() });
      if (!response.ok) throw new Error("offline");
      payload = await response.json();
    } catch {
      mode = "local";
      authRequired = false;
      loadFromLocal();
      setStatus("local");
      return { mode };
    }
    authRequired = !!payload.auth;
    mode = payload.mode === "edit" ? "edit" : "view";
    if (payload.empty) {
      if (mode === "edit") {
        loadFromLocal();
        saveLocal();
        try { await pushNow(); } catch { setStatus("error"); }
      } else {
        applyState({ version: 1, currentId: null, families: [] }, false);
        setStatus("view");
      }
    } else {
      applyState(payload.state, mode !== "view");
      saveLocal();
      if (mode === "edit" && extrasChanged) {
        extrasChanged = false;
        try { await pushNow(); } catch { setStatus("error"); }
      } else setStatus(mode === "edit" ? "saved" : "view");
    }
    return { mode, auth: authRequired };
  }

  async function login(key) {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (!response.ok) return false;
    try { localStorage.setItem(ACCESS_KEY, key); } catch { /* bỏ qua */ }
    return true;
  }

  function logout() {
    try { localStorage.removeItem(ACCESS_KEY); } catch { /* bỏ qua */ }
  }

  function emit() {
    save();
    listeners.forEach((fn) => fn());
  }

  function current() {
    return state.families.find((family) => family.id === state.currentId) || state.families[0] || {
      id: "",
      name: "Chưa có gia phả",
      isPublic: false,
      collapsed: [],
      people: [],
      intro: "",
      photos: [],
      tombs: [],
    };
  }

  function person(id) {
    if (!id) return null;
    return current().people.find((item) => item.id === id) || null;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function addFamily(name) {
    const family = { id: uid("f"), name: name.trim(), isPublic: false, collapsed: [], people: [], intro: "", photos: [], tombs: [] };
    state.families.push(family);
    state.currentId = family.id;
    emit();
    return family.id;
  }

  function renameFamily(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return { ok: false, error: "Tên gia phả không được để trống" };
    current().name = trimmed;
    emit();
    return { ok: true };
  }

  function deleteFamily(id) {
    if (state.families.length <= 1) return { ok: false, error: "Cần giữ lại ít nhất một gia phả" };
    state.families = state.families.filter((family) => family.id !== id);
    if (!state.families.some((family) => family.id === state.currentId)) state.currentId = state.families[0].id;
    emit();
    return { ok: true };
  }

  function updateFamily(patch) {
    Object.assign(current(), patch);
    emit();
  }

  function updatePerson(id, patch) {
    const family = current();
    const target = family.people.find((item) => item.id === id);
    if (!target) return { ok: false, error: "Không tìm thấy người này" };
    const name = String(patch.name || "").trim();
    if (!name) return { ok: false, error: "Nhập họ và tên" };
    const fatherId = patch.fatherId || null;
    const motherId = patch.motherId || null;
    if (fatherId === id || motherId === id) return { ok: false, error: "Không thể chọn chính mình làm cha mẹ" };
    if (fatherId && motherId && fatherId === motherId) return { ok: false, error: "Cha và mẹ phải là hai người khác nhau" };
    if (fatherId && isDescendant(family.people, id, fatherId)) return { ok: false, error: "Không thể chọn con cháu làm cha" };
    if (motherId && isDescendant(family.people, id, motherId)) return { ok: false, error: "Không thể chọn con cháu làm mẹ" };
    if ((target.spouseIds || []).includes(fatherId) || (target.spouseIds || []).includes(motherId)) {
      return { ok: false, error: "Vợ/chồng không thể đồng thời là cha mẹ trên phả đồ" };
    }
    target.name = name;
    target.gender = patch.gender === "female" ? "female" : "male";
    target.birth = patch.birth ?? null;
    target.birthMonth = datePart(patch.birthMonth, 12);
    target.birthDay = target.birthMonth ? datePart(patch.birthDay, 31) : null;
    if ((target.birthDay || target.birthMonth) && !target.birth) {
      target.birthDay = null;
      target.birthMonth = null;
    }
    target.death = patch.death ?? null;
    target.fatherId = fatherId;
    target.motherId = motherId;
    target.note = patch.note || "";
    emit();
    return { ok: true };
  }

  function setBio(id, bio) {
    const target = current().people.find((item) => item.id === id);
    if (!target) return { ok: false, error: "Không tìm thấy người này" };
    const text = String(bio || "").replace(/\r\n/g, "\n").trim();
    if (text.length > 8000) return { ok: false, error: "Tiểu sử tối đa 8000 ký tự" };
    target.bio = text;
    emit();
    return { ok: true };
  }

  function deletePerson(id) {
    const family = current();
    family.people = family.people.filter((item) => item.id !== id);
    for (const item of family.people) {
      if (item.fatherId === id) item.fatherId = null;
      if (item.motherId === id) item.motherId = null;
      if (item.externalFatherId === id) item.externalFatherId = null;
      if (item.externalMotherId === id) item.externalMotherId = null;
      item.spouseIds = item.spouseIds.filter((spouseId) => spouseId !== id);
    }
    family.collapsed = family.collapsed.filter((key) => !key.split("~").includes(id));
    emit();
  }

  function parentSlots(primary, spouse) {
    let fatherId = null;
    let motherId = null;
    for (const item of [primary, spouse].filter(Boolean)) {
      if (item.gender === "female") motherId = motherId || item.id;
      else fatherId = fatherId || item.id;
    }
    return { fatherId, motherId };
  }

  function addChild(parentId, spouseId, data) {
    const family = current();
    const parent = family.people.find((item) => item.id === parentId);
    if (!parent) return { ok: false, error: "Không tìm thấy cha hoặc mẹ" };
    const spouse = spouseId ? family.people.find((item) => item.id === spouseId) : null;
    const child = blankPerson(data);
    if (!child.name) return { ok: false, error: "Nhập họ và tên" };
    Object.assign(child, parentSlots(parent, spouse));
    const siblings = family.people.filter(
      (item) => (child.fatherId && item.fatherId === child.fatherId) || (child.motherId && item.motherId === child.motherId)
    );
    child.order = siblings.reduce((max, item) => Math.max(max, item.order || 0), 0) + 1;
    family.people.push(child);
    emit();
    return { ok: true, id: child.id };
  }

  function addSpouse(personId, data) {
    const family = current();
    const person = family.people.find((item) => item.id === personId);
    if (!person) return { ok: false, error: "Không tìm thấy người này" };
    const spouse = blankPerson(data);
    if (!spouse.name) return { ok: false, error: "Nhập họ và tên" };
    family.people.push(spouse);
    person.spouseIds = [...new Set([...person.spouseIds, spouse.id])];
    spouse.spouseIds = [personId];
    emit();
    return { ok: true, id: spouse.id };
  }

  function addAncestors(targetId, fatherData, motherData) {
    const family = current();
    const created = [];
    let father = null;
    let mother = null;
    if (fatherData && String(fatherData.name || "").trim()) {
      father = blankPerson({ ...fatherData, gender: "male" });
      created.push(father);
    }
    if (motherData && String(motherData.name || "").trim()) {
      mother = blankPerson({ ...motherData, gender: "female" });
      created.push(mother);
    }
    if (!created.length) return { ok: false, error: "Nhập ít nhất tên cha hoặc mẹ" };
    if (father && mother) {
      father.spouseIds = [mother.id];
      mother.spouseIds = [father.id];
    }
    family.people.push(...created);
    if (targetId) {
      const target = family.people.find((item) => item.id === targetId);
      if (target) {
        if (father) target.fatherId = father.id;
        if (mother) target.motherId = mother.id;
      }
    }
    emit();
    return { ok: true, id: (father || mother).id };
  }

  function resolveLink(family, personId, existingId, name, gender) {
    const trimmed = String(name || "").trim();
    if (trimmed) {
      const created = blankPerson({ name: trimmed, gender, external: true });
      family.people.push(created);
      return created.id;
    }
    if (!existingId) return null;
    if (existingId === personId) return { error: "Không thể chọn chính mình" };
    if (!family.people.some((item) => item.id === existingId)) return { error: "Không tìm thấy người được chọn" };
    return existingId;
  }

  function moveCluster(anchorId, memberIds, fatherId, motherId) {
    const family = current();
    const members = (memberIds || []).map((id) => family.people.find((person) => person.id === id)).filter(Boolean);
    const anchor = members.find((person) => person.id === anchorId) || family.people.find((person) => person.id === anchorId);
    if (!anchor || anchor.external) return { ok: false, error: "Không chuyển được cụm này" };
    fatherId = fatherId || null;
    motherId = motherId || null;
    if (fatherId && fatherId === motherId) return { ok: false, error: "Cha và mẹ phải là hai người khác nhau" };
    const groupIds = members.length ? members.map((person) => person.id) : [anchor.id];
    const blocked = new Set(groupIds);
    const stack = groupIds.slice();
    const seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      blocked.add(id);
      for (const person of family.people) {
        if (person.fatherId === id || person.motherId === id) {
          stack.push(person.id);
          (person.spouseIds || []).forEach((spouseId) => stack.push(spouseId));
        }
      }
    }
    if ((fatherId && blocked.has(fatherId)) || (motherId && blocked.has(motherId))) {
      return { ok: false, error: "Không thể chuyển cụm vào chính nó hoặc vào con cháu" };
    }
    const father = fatherId ? family.people.find((person) => person.id === fatherId) : null;
    const mother = motherId ? family.people.find((person) => person.id === motherId) : null;
    if (fatherId && (!father || father.external)) return { ok: false, error: "Không tìm thấy nhánh cha" };
    if (motherId && (!mother || mother.external)) return { ok: false, error: "Không tìm thấy nhánh mẹ" };
    const samePlace = (anchor.fatherId || null) === fatherId && (anchor.motherId || null) === motherId;
    const othersClear = members.every((person) => person.id === anchor.id || (!person.fatherId && !person.motherId));
    if (samePlace && othersClear) return { ok: false, error: "Cụm này đang ở đúng nhánh đó" };
    anchor.fatherId = fatherId;
    anchor.motherId = motherId;
    for (const person of members) {
      if (person.id === anchor.id) continue;
      person.fatherId = null;
      person.motherId = null;
    }
    if (fatherId || motherId) {
      const siblings = family.people.filter((person) => person.id !== anchor.id && ((fatherId && person.fatherId === fatherId) || (motherId && person.motherId === motherId)));
      anchor.order = siblings.reduce((max, person) => Math.max(max, person.order || 0), 0) + 1;
    }
    emit();
    return { ok: true, id: anchor.id };
  }

  function setShrineMap(src) {
    current().shrineMap = src || "";
    emit();
    return { ok: true };
  }

  function updateIntro(html) {
    const family = current();
    family.intro = String(html || "").slice(0, 200000);
    save();
  }

  function addAlbumPhoto(key, title, src, limitMessage) {
    const family = current();
    const trimmed = String(title || "").trim();
    if (!trimmed) return { ok: false, error: "Nhập tiêu đề cho ảnh" };
    if (trimmed.length > 120) return { ok: false, error: "Tiêu đề tối đa 120 ký tự" };
    if (!Array.isArray(family[key])) family[key] = [];
    if (family[key].length >= 24) return { ok: false, error: limitMessage };
    if (!photoOk({ id: "p", title: trimmed, src })) return { ok: false, error: "Ảnh quá lớn hoặc không đọc được" };
    const photo = { id: uid(key === "tombs" ? "t" : "a"), title: trimmed, src };
    family[key].push(photo);
    emit();
    return { ok: true, id: photo.id };
  }

  function updateAlbumPhoto(key, id, title) {
    const photo = (current()[key] || []).find((item) => item.id === id);
    if (!photo) return { ok: false, error: "Không tìm thấy ảnh" };
    const trimmed = String(title || "").trim();
    if (!trimmed) return { ok: false, error: "Nhập tiêu đề cho ảnh" };
    photo.title = trimmed.slice(0, 120);
    emit();
    return { ok: true };
  }

  function deleteAlbumPhoto(key, id) {
    const family = current();
    family[key] = (family[key] || []).filter((item) => item.id !== id);
    emit();
    return { ok: true };
  }

  function addPhoto(title, src) {
    return addAlbumPhoto("photos", title, src, "Mỗi gia phả giữ tối đa 24 ảnh");
  }

  function updatePhoto(id, title) {
    return updateAlbumPhoto("photos", id, title);
  }

  function deletePhoto(id) {
    return deleteAlbumPhoto("photos", id);
  }

  function addTomb(title, src) {
    return addAlbumPhoto("tombs", title, src, "Khu lăng mộ giữ tối đa 24 ảnh");
  }

  function updateTomb(id, title) {
    return updateAlbumPhoto("tombs", id, title);
  }

  function deleteTomb(id) {
    return deleteAlbumPhoto("tombs", id);
  }

  function linkExternal(personId, spec) {
    const family = current();
    const person = family.people.find((item) => item.id === personId);
    if (!person) return { ok: false, error: "Không tìm thấy người này" };
    const father = resolveLink(family, personId, spec.fatherId, spec.fatherName, "male");
    if (father && father.error) return { ok: false, error: father.error };
    const mother = resolveLink(family, personId, spec.motherId, spec.motherName, "female");
    if (mother && mother.error) return { ok: false, error: mother.error };
    person.externalFatherId = father || null;
    person.externalMotherId = mother || null;
    emit();
    return { ok: true };
  }

  function reset() {
    if (!writable()) return;
    state = seed();
    emit();
  }

  return {
    load,
    hydrate,
    login,
    logout,
    save,
    subscribe,
    emit,
    current,
    state: () => state,
    writable,
    authRequired: () => authRequired,
    onStatus(fn) { statusHandler = fn; },
    person,
    addFamily,
    renameFamily,
    deleteFamily,
    updateFamily,
    updatePerson,
    setBio,
    deletePerson,
    addChild,
    addSpouse,
    addAncestors,
    moveCluster,
    updateIntro,
    setShrineMap,
    addPhoto,
    updatePhoto,
    deletePhoto,
    addTomb,
    updateTomb,
    deleteTomb,
    linkExternal,
    reset,
  };
})();
