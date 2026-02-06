#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const TRANSCRIPTS_DIR = join(DATA_DIR, 'transcripts');
const OUTPUT_FILE = join(ROOT, 'src', 'data', 'episodes.json');

// Expanded buzzword dictionary - includes PRD terms + additional common PM/tech buzzwords
const BUZZWORDS = [
  // Original PRD terms
  'North Star Metric', 'Product-Market Fit', 'First Principles', 'Flywheel', 'Jobs To Be Done',
  'Activation Rate', 'Retention Curve', 'Growth Loop', 'ICPs', 'OKRs',
  'A/B Test', 'Opportunity Cost', 'User Journey', 'Ship It', 'Technical Debt',
  'Stakeholder Alignment', 'Cross-Functional', 'Leverage', 'Scalable', 'Data-Driven',
  'Double Down', 'Iterate', 'Unlock Value', '10x', 'Zero to One',
  'Founder Mode', 'Inflection Point', 'Surface Area', 'Compounding', 'Moat',
  'Velocity', 'Cohort Analysis', 'Power Users', 'Framework', 'Mental Model',
  'Optionality', 'Second-Order Effects', 'Bottleneck', 'Low-Hanging Fruit', 'Table Stakes',
  'Dogfooding', 'Canonical', 'Atomic Unit', 'Time to Value', 'Aha Moment',
  'Wedge', 'PLG', 'Network Effects', 'Marketplace Liquidity', 'Switching Costs',
  'Churn', 'ARPU', 'LTV/CAC', 'Payback Period', 'Virality Coefficient',
  'Headwinds', 'Tailwinds', 'Friction', 'Delight', 'Forcing Function',
  'Guardrails', 'Alignment', 'North Star', 'Prioritization', 'Trade-offs',
  'Retention', 'Activation', 'Onboarding', 'Conversion Rate', 'Funnel',
  'Product Sense', 'Execution', 'Strategy', 'Roadmap', 'Backlog',
  'MVP', 'Hypothesis', 'Experiment', 'Signal', 'Noise',
  'Platform', 'Ecosystem', 'Attribution', 'Segmentation', 'Persona',
  // Additional common PM buzzwords
  'User Experience', 'Pain Point', 'Use Case', 'Best Practice', 'Deep Dive',
  'Stakeholder', 'Bandwidth', 'Sync', 'Circle Back', 'Take Offline',
  'Move the Needle', 'Quick Win', 'Game Changer', 'Paradigm Shift', 'Synergy',
  'Pivot', 'Scale', 'Growth', 'Traction', 'Visibility',
  'Actionable', 'KPIs', 'Metrics', 'Dashboard', 'Analytics',
  'User Feedback', 'Customer Journey', 'Touchpoint', 'End-to-End', 'Full Stack',
  'Agile', 'Sprint', 'Standup', 'Retrospective', 'Scrum',
  'Feature Flag', 'Roll Out', 'Beta', 'Launch', 'Go-to-Market',
  'Value Prop', 'Differentiation', 'Competitive Advantage', 'Market Fit', 'TAM',
  'B2B', 'B2C', 'SaaS', 'Enterprise', 'Self-Serve',
  'Freemium', 'Upsell', 'Cross-Sell', 'Land and Expand', 'Customer Success',
  'NPS', 'CSAT', 'DAU', 'MAU', 'WAU',
  'Engagement', 'Stickiness', 'Virality', 'Referral', 'Word of Mouth',
  'Unit Economics', 'Burn Rate', 'Runway', 'Series A', 'Valuation',
  'Due Diligence', 'Term Sheet', 'Cap Table', 'Equity', 'Vesting',
  'Async', 'Bandwidth', 'Capacity', 'Resources', 'Headcount',
  'Scope Creep', 'Feature Creep', 'Bikeshedding', 'Yak Shaving', 'Rabbit Hole',
  'Tiger Team', 'War Room', 'All Hands', 'Town Hall', 'Offsite',
  'Culture', 'Mission', 'Vision', 'Values', 'Purpose',
  'Impact', 'Outcome', 'Output', 'Input', 'Throughput'
];

// Pre-compile regex patterns for each buzzword (case-insensitive, word boundary)
const BUZZWORD_PATTERNS = BUZZWORDS.map(bw => ({
  term: bw,
  regex: new RegExp(`\\b${bw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
}));

function cloneOrUpdateRepo() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (existsSync(TRANSCRIPTS_DIR)) {
    console.log('Transcripts repo already exists, pulling latest...');
    try {
      execSync('git pull', { cwd: TRANSCRIPTS_DIR, stdio: 'inherit' });
    } catch (e) {
      console.log('Pull failed, continuing with existing data...');
    }
  } else {
    console.log('Cloning transcripts repo...');
    execSync(
      'git clone --depth 1 https://github.com/ChatPRD/lennys-podcast-transcripts.git transcripts',
      { cwd: DATA_DIR, stdio: 'inherit' }
    );
  }
}

function findBuzzwords(transcriptText) {
  const found = [];
  for (const { term, regex } of BUZZWORD_PATTERNS) {
    if (regex.test(transcriptText)) {
      found.push(term);
    }
  }
  return found;
}

function parseEpisode(episodeDir) {
  const transcriptPath = join(episodeDir, 'transcript.md');
  if (!existsSync(transcriptPath)) {
    return null;
  }

  const content = readFileSync(transcriptPath, 'utf-8');
  const { data: frontmatter, content: transcriptBody } = matter(content);

  // Extract required fields
  const guest = frontmatter.guest;
  const title = frontmatter.title;
  const youtubeUrl = frontmatter.youtube_url;
  const videoId = frontmatter.video_id;

  if (!guest || !title || !youtubeUrl || !videoId) {
    console.warn(`Skipping ${episodeDir}: missing required frontmatter fields`);
    return null;
  }

  // Optional fields
  const duration = frontmatter.duration || null;

  // Find buzzwords in transcript
  const buzzwordsFound = findBuzzwords(transcriptBody);

  return {
    guest,
    title,
    youtubeUrl,
    videoId,
    duration,
    buzzwordsFound,
    buzzwordCount: buzzwordsFound.length
  };
}

function main() {
  console.log('PM Buzzword Bingo - Episode Data Builder\n');

  // Clone or update the transcripts repo
  cloneOrUpdateRepo();

  const episodesDir = join(TRANSCRIPTS_DIR, 'episodes');
  if (!existsSync(episodesDir)) {
    console.error('Episodes directory not found!');
    process.exit(1);
  }

  // Get all episode directories
  const episodeFolders = readdirSync(episodesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log(`\nFound ${episodeFolders.length} episode folders`);

  // Parse each episode
  const episodes = [];
  let skippedLowBuzzwords = 0;
  let skippedMissingData = 0;

  for (const folder of episodeFolders) {
    const episodePath = join(episodesDir, folder);
    const episode = parseEpisode(episodePath);

    if (!episode) {
      skippedMissingData++;
      continue;
    }

    // Only include episodes with 25+ buzzwords (enough for a bingo card + variety)
    if (episode.buzzwordCount < 25) {
      skippedLowBuzzwords++;
      continue;
    }

    episodes.push(episode);
  }

  // Sort by guest name for consistent ordering
  episodes.sort((a, b) => a.guest.localeCompare(b.guest));

  console.log(`\nResults:`);
  console.log(`  - Episodes with 25+ buzzwords: ${episodes.length}`);
  console.log(`  - Skipped (< 25 buzzwords): ${skippedLowBuzzwords}`);
  console.log(`  - Skipped (missing data): ${skippedMissingData}`);

  // Show some stats
  const avgBuzzwords = episodes.reduce((sum, e) => sum + e.buzzwordCount, 0) / episodes.length;
  console.log(`  - Average buzzwords per episode: ${avgBuzzwords.toFixed(1)}`);

  // Write output
  writeFileSync(OUTPUT_FILE, JSON.stringify(episodes, null, 2));
  console.log(`\nWrote ${episodes.length} episodes to ${OUTPUT_FILE}`);
}

main();
