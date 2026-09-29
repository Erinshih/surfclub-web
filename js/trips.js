/* =========================================================
   檔案：js/trips.js
   出團紀錄（trips）共用：讀取、當天升級統計、畫面
   ========================================================= */

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import {
  formatLevel,
  getLevel,
  getLevelByValue
} from "./levels.js";

import {
  escapeHtml,
  getInitial,
  getProfile,
  loadLevelHistory,
  toDateString
} from "./member-card.js";

/* =========================================================
   讀取
   ========================================================= */

export async function loadTrips(db, maxCount = 0) {
  const constraints = [
    orderBy("date", "desc")
  ];

  if (maxCount > 0) {
    constraints.push(limit(maxCount));
  }

  const snapshot =
    await getDocs(
      query(collection(db, "trips"), ...constraints)
    );

  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    ...documentSnapshot.data()
  }));
}

export async function loadApprovedMembers(db) {
  const snapshot =
    await getDocs(
      query(
        collection(db, "users"),
        where("status", "==", "approved")
      )
    );

  return new Map(
    snapshot.docs.map((documentSnapshot) => [
      documentSnapshot.id,
      documentSnapshot.data()
    ])
  );
}

export function getParticipants(trip) {
  return Array.isArray(trip.participants)
    ? trip.participants
    : [];
}

/*
 * 只接受 http(s) 網址，避免 javascript: 之類的連結
 */
export function getLinks(trip) {
  if (!Array.isArray(trip.links)) {
    return [];
  }

  return trip.links.filter((link) => {
    try {
      return ["http:", "https:"].includes(new URL(link?.url).protocol);
    } catch {
      return false;
    }
  });
}

function getDefaultLinkLabel(url) {
  const host =
    new URL(url).hostname;

  if (host.includes("photos.google") || host.includes("photos.app.goo.gl")) {
    return "📷 Google 相簿";
  }

  if (host.includes("drive.google")) {
    return "📁 Google 雲端硬碟";
  }

  if (host.includes("youtube") || host.includes("youtu.be")) {
    return "🎬 YouTube";
  }

  if (host.includes("instagram")) {
    return "📸 Instagram";
  }

  return "🔗 開啟連結";
}

export function renderTripLinks(trip) {
  const links =
    getLinks(trip);

  if (links.length === 0) {
    return "";
  }

  return `
    <div class="trip-links">
      ${links.map((link) => `
        <a
          class="button button-small trip-link"
          href="${escapeHtml(link.url)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${escapeHtml(link.label || getDefaultLinkLabel(link.url))}
        </a>
      `).join("")}
    </div>
  `;
}

export function getHighlights(trip) {
  return Array.isArray(trip.highlights)
    ? trip.highlights.filter(Boolean)
    : [];
}

/*
 * 當天升級：參加社員的升級紀錄中，日期剛好是出團那天的
 */
export async function loadTripLevelUps(db, trip) {
  const results =
    await Promise.all(
      getParticipants(trip).map(async (uid) => {
        const history =
          await loadLevelHistory(db, uid);

        return history
          .filter((item) => {
            const date =
              item.unlockedAt?.toDate?.();

            return date &&
              toDateString(date) === trip.date &&
              Number(item.levelValue) > 0;
          })
          .map((item) => ({
            uid,
            levelValue: Number(item.levelValue)
          }));
      })
    );

  return results.flat();
}

/* =========================================================
   畫面
   ========================================================= */

export function formatTripDate(dateText) {
  const match =
    String(dateText || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return dateText || "";
  }

  return `${Number(match[2])}/${Number(match[3])}`;
}

/*
 * 「2 個人升 Lv.2、1 個人升 Lv.3」
 */
export function describeLevelUps(levelUps) {
  const counts = new Map();

  levelUps.forEach(({ levelValue }) => {
    counts.set(levelValue, (counts.get(levelValue) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((first, second) => first[0] - second[0])
    .map(([value, count]) => {
      const level = getLevelByValue(value);

      return `${count} 個人升上 ${level ? `${level.emoji} ${level.name}` : `Lv.${value}`}`;
    });
}

export function renderTripFacts(trip, levelUps) {
  const facts = [
    `<li><strong>${getParticipants(trip).length}</strong> 人下水</li>`
  ];

  if (levelUps) {
    describeLevelUps(levelUps).forEach((text) => {
      facts.push(`<li>${escapeHtml(text)}</li>`);
    });
  }

  getHighlights(trip).forEach((text) => {
    facts.push(`<li>${escapeHtml(text)}</li>`);
  });

  return `<ul class="trip-facts">${facts.join("")}</ul>`;
}

export function renderQuote(trip) {
  if (!trip.quote) {
    return "";
  }

  return `
    <blockquote class="trip-quote">
      <p>${escapeHtml(trip.quote)}</p>
      ${trip.quoteBy ? `<cite>— ${escapeHtml(trip.quoteBy)}</cite>` : ""}
    </blockquote>
  `;
}

export function renderParticipants(trip, membersMap) {
  const participants =
    getParticipants(trip)
      .map((uid) => ({ uid, data: membersMap.get(uid) }))
      .filter((member) => member.data);

  if (participants.length === 0) {
    return `<p class="empty-state">沒有紀錄參加的社員。</p>`;
  }

  return `
    <ul class="trip-participants">
      ${participants.map(({ data }) => {
        const level = getLevel(data.level);
        const nickname = getProfile(data).nickname;

        return `
          <li title="${escapeHtml(formatLevel(level))}">
            <span
              class="character-avatar"
              style="--level-color: ${level?.color || "#8a9ea1"}"
              aria-hidden="true"
            >
              ${escapeHtml(getInitial(data))}
            </span>
            <span>${escapeHtml(nickname || data.name || "社員")}</span>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

export function renderTripTitle(trip) {
  return `🌊 ${escapeHtml(formatTripDate(trip.date))} ${escapeHtml(trip.title || trip.spot || "出團")}`;
}
