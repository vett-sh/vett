import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { VettConfig, InstalledSkill } from '@vett/core';

const CONFIG_DIR = join(homedir(), '.vett');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const SKILLS_DIR = join(CONFIG_DIR, 'skills');

const DEFAULT_CONFIG: VettConfig = {
  installDir: SKILLS_DIR,
  registryUrl: 'https://vett.sh',
  installedSkills: [],
};

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(SKILLS_DIR)) {
    mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

export function loadConfig(): VettConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: VettConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getSkillPath(owner: string, repo: string, name: string): string {
  return join(SKILLS_DIR, owner, repo, name);
}

export function addInstalledSkill(skill: InstalledSkill): void {
  const config = loadConfig();
  const existingIndex = config.installedSkills.findIndex(
    (s) => s.owner === skill.owner && s.repo === skill.repo && s.name === skill.name
  );

  if (existingIndex >= 0) {
    config.installedSkills[existingIndex] = skill;
  } else {
    config.installedSkills.push(skill);
  }

  saveConfig(config);
}

export function removeInstalledSkill(owner: string, repo: string, name: string): void {
  const config = loadConfig();
  config.installedSkills = config.installedSkills.filter(
    (s) => !(s.owner === owner && s.repo === repo && s.name === name)
  );
  saveConfig(config);
}

export function getInstalledSkill(
  owner: string,
  repo: string,
  name: string
): InstalledSkill | undefined {
  const config = loadConfig();
  return config.installedSkills.find(
    (s) => s.owner === owner && s.repo === repo && s.name === name
  );
}
