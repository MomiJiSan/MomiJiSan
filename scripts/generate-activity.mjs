import { mkdir, readFile, writeFile } from 'node:fs/promises';

const username = process.env.PROFILE_USERNAME || 'MomiJiSan';
if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) throw new Error('Invalid GitHub username');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const end = new Date(`${today}T00:00:00Z`);
const dates = Array.from({ length: 31 }, (_, i) => new Date(end.getTime() - (30 - i) * 86400000).toISOString().slice(0, 10));
let result;
if (process.env.CONTRIBUTIONS_JSON) {
  result = JSON.parse(await readFile(process.env.CONTRIBUTIONS_JSON, 'utf8'));
} else {
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required');
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'query($login: String!, $from: DateTime!, $to: DateTime!) { user(login: $login) { contributionsCollection(from: $from, to: $to) { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }',
      variables: { login: username, from: `${dates[0]}T00:00:00+08:00`, to: `${today}T23:59:59+08:00` },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
  result = await response.json();
}
if (result.errors) throw new Error(JSON.stringify(result.errors));
const weeks = result.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
if (!Array.isArray(weeks)) throw new Error('Missing contribution calendar');
const byDate = new Map(weeks.flatMap(week => week.contributionDays).map(day => [day.date, day.contributionCount]));
const counts = dates.map(date => {
  const count = byDate.get(date);
  if (!Number.isInteger(count) || count < 0) throw new Error(`Missing or invalid contribution count: ${date}`);
  return count;
});
const total = counts.reduce((sum, count) => sum + count, 0);
const step = Math.max(1, Math.ceil(Math.max(...counts) / 4));
const ceiling = step * 4;
const x = i => 54 + i * 682 / 30;
const y = count => 236 - count * 148 / ceiling;
const points = counts.map((count, i) => `${x(i).toFixed(2)},${y(count).toFixed(2)}`).join(' ');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const themes = {
  light: { bg: '#FBF6EF', text: '#776062', accent: '#A63F43', grid: '#DBCBC0' },
  dark: { bg: '#191A22', text: '#CCAFAD', accent: '#FFAA8B', grid: '#4C3642' },
};
await mkdir('assets', { recursive: true });
for (const [name, theme] of Object.entries(themes)) {
  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = i * step;
    return `<line x1="54" y1="${y(value)}" x2="736" y2="${y(value)}" stroke="${theme.grid}" opacity=".6"/><text x="43" y="${y(value) + 4}" text-anchor="end" font-size="11">${value}</text>`;
  }).join('');
  const labels = [0, 5, 10, 15, 20, 25, 30].map(i => `<text x="${x(i)}" y="257" text-anchor="middle" font-size="11">${dates[i].slice(5).replace('-', '/')}</text>`).join('');
  const dots = counts.map((count, i) => `<circle cx="${x(i)}" cy="${y(count)}" r="3" fill="#E37464"><title>${dates[i]}: ${count} contributions</title></circle>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="300" viewBox="0 0 760 300" role="img" aria-labelledby="title desc">
<title id="title">${escape(username)} · 最近 31 天的贡献</title>
<desc id="desc">${dates[0]} 至 ${today}，共 ${total} 次 GitHub 贡献。每日贡献：${counts.join(', ')}。</desc>
<rect width="760" height="300" rx="16" fill="${theme.bg}"/>
<g font-family="'Segoe UI',Arial,sans-serif" fill="${theme.text}">
<text x="24" y="35" font-size="18" font-weight="600" fill="${theme.accent}">最近 31 天的贡献</text>
<text x="24" y="59" font-size="12">${dates[0]} — ${today} · ${total} contributions</text>
${grid}
<polygon points="54,236 ${points} 736,236" fill="#E37464" opacity=".13"/>
<polyline points="${points}" fill="none" stroke="${theme.accent}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
${dots}${labels}
<text x="736" y="282" text-anchor="end" font-size="10">GitHub contributions · Asia/Shanghai</text>
</g>
</svg>\n`;
  await writeFile(`assets/activity-${name}.svg`, svg);
}
console.log(`Generated 31-day contribution graphs for ${username}: ${dates[0]} through ${today}, ${total} contributions.`);
