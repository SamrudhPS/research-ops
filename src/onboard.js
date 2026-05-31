import inquirer from 'inquirer';
import chalk from 'chalk';
import Table from 'cli-table3';
import { writeProfile } from './utils/profile.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseList(str) {
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function label(enumVal) {
  return enumVal.replace(/_/g, ' ');
}

function eg(text) {
  console.log(chalk.gray(`  e.g. ${text}`));
}

// ---------------------------------------------------------------------------
// Domain-aware tool suggestions
// ---------------------------------------------------------------------------

const TOOL_SUGGESTIONS = [
  {
    match: ['machine learning', 'ml', 'deep learning', 'ai', 'artificial intelligence'],
    tools: 'Colab, Jupyter, Weights & Biases, HuggingFace, MLflow',
  },
  {
    match: ['computer vision', 'cv', 'vision', 'image processing'],
    tools: 'Colab, OpenCV, Roboflow, Albumentations, LabelImg',
  },
  {
    match: ['nlp', 'natural language', 'language model', 'text mining'],
    tools: 'HuggingFace, spaCy, LangChain, NLTK, Colab',
  },
  {
    match: ['robotics', 'ros', 'autonomous systems', 'control'],
    tools: 'ROS, Gazebo, OpenCV, Jupyter, MATLAB',
  },
  {
    match: ['systems', 'distributed', 'networking', 'network', 'os', 'operating systems'],
    tools: 'Docker, Kubernetes, Wireshark, Prometheus, Linux',
  },
  {
    match: ['security', 'cybersecurity', 'cryptography'],
    tools: 'Wireshark, Burp Suite, Metasploit, Docker',
  },
  {
    match: ['data science', 'data analysis', 'analytics'],
    tools: 'Jupyter, pandas, Tableau, Power BI, Colab',
  },
  {
    match: ['bioinformatics', 'genomics', 'biology', 'biomedical'],
    tools: 'Jupyter, Biopython, Galaxy, R / Bioconductor',
  },
];

function getDomainToolSuggestions(domain) {
  const d = domain.toLowerCase();
  for (const { match, tools } of TOOL_SUGGESTIONS) {
    if (match.some((m) => d.includes(m))) return tools;
  }
  return 'Jupyter, Colab, Docker, VS Code, GitHub';
}

// ---------------------------------------------------------------------------
// North Star summary
// ---------------------------------------------------------------------------

function buildNorthStarSummary({ profile, domain, skills, constraints, goals }) {
  const subs =
    domain.sub_areas.length > 0
      ? `, with a focus on ${domain.sub_areas.join(' and ')}`
      : '';
  const langs =
    skills.programming.length > 0
      ? skills.programming.slice(0, 3).join(', ')
      : 'general programming tools';
  const topics =
    goals.interests.length > 0
      ? goals.interests.slice(0, 3).join(', ')
      : 'the problems they find most compelling';

  const s1 = `${profile.name} is a ${skills.level}-level researcher in ${domain.primary}${subs}.`;
  const s2 =
    `They have ${constraints.hours_per_week} hours per week, work on ${label(constraints.compute)}, ` +
    `and use ${langs} — with ${skills.math_comfort} mathematical comfort.`;
  const s3 =
    `Their goal is a ${label(goals.north_star)} — ${goals.purpose.replace(/\.$/, '')} — ` +
    `making ${topics} the most natural research territory for where they are right now.`;

  return `${s1} ${s2} ${s3}`;
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

export async function runOnboard() {
  console.log(chalk.bold.cyan('\nResearch-Ops: Researcher Onboarding'));
  console.log(chalk.gray("We'll build your researcher profile one section at a time."));
  console.log(chalk.gray('Answer honestly — there are no wrong answers, and you can re-run this any time.\n'));

  // eslint-disable-next-line no-constant-condition
  while (true) {

    // ── Section 1: About You ─────────────────────────────────────────────────

    console.log(chalk.bold.yellow('Section 1 — About You\n'));

    const { name } = await inquirer.prompt([{
      type: 'input',
      name: 'name',
      message: 'What is your name?',
      validate: (v) => v.trim().length > 0 || 'Name is required.',
    }]);

    eg('"Machine Learning", "Computer Vision", "Systems", "Bioinformatics"');
    const { primary } = await inquirer.prompt([{
      type: 'input',
      name: 'primary',
      message: 'What is your primary research domain?',
      validate: (v) => v.trim().length > 0 || 'Domain is required.',
    }]);

    eg('"NLP, federated learning, diffusion models"  —  press Enter to skip');
    const { sub_areas } = await inquirer.prompt([{
      type: 'input',
      name: 'sub_areas',
      message: 'Which sub-areas interest you?',
    }]);

    // ── Section 2: Your Skills ───────────────────────────────────────────────

    console.log(chalk.bold.yellow('\nSection 2 — Your Skills\n'));

    const { level } = await inquirer.prompt([{
      type: 'list',
      name: 'level',
      message: 'What is your overall research skill level?',
      choices: [
        { name: 'Beginner      — new to research, still learning how it works', value: 'beginner' },
        { name: 'Intermediate  — done a project or two, building your own style', value: 'intermediate' },
        { name: 'Advanced      — experienced, can drive a project independently', value: 'advanced' },
      ],
    }]);

    eg('"Python, PyTorch, scikit-learn, NumPy, pandas"');
    const { programming } = await inquirer.prompt([{
      type: 'input',
      name: 'programming',
      message: 'Which programming languages and libraries do you use?',
    }]);

    const toolHint = getDomainToolSuggestions(primary);
    console.log(chalk.gray(`  Common tools for ${chalk.white(primary)}: ${toolHint}`));
    const { tools } = await inquirer.prompt([{
      type: 'input',
      name: 'tools',
      message: 'Which of these (or others) do you use? ',
    }]);

    const { math_comfort } = await inquirer.prompt([{
      type: 'list',
      name: 'math_comfort',
      message: 'How comfortable are you with research-level mathematics?',
      choices: [
        { name: 'Low    — I prefer empirical / engineering work over proofs', value: 'low' },
        { name: 'Medium — I can follow derivations with some effort', value: 'medium' },
        { name: "High   — I'm comfortable reading and writing proofs", value: 'high' },
      ],
    }]);

    // ── Section 3: Your Constraints ──────────────────────────────────────────

    console.log(chalk.bold.yellow('\nSection 3 — Your Constraints\n'));

    console.log(chalk.gray('  Be honest — 5 h/week is a completely valid answer.'));
    const { hours_per_week } = await inquirer.prompt([{
      type: 'number',
      name: 'hours_per_week',
      message: 'How many hours per week can you put into research?',
      validate: (v) => (Number.isFinite(v) && v > 0) || 'Enter a positive number (e.g. 8).',
    }]);

    const { compute } = await inquirer.prompt([{
      type: 'list',
      name: 'compute',
      message: 'What is your best available compute resource?',
      choices: [
        { name: 'Laptop             — personal machine, CPU or consumer GPU', value: 'laptop' },
        { name: 'University cluster — shared HPC or GPU servers through your institution', value: 'university_cluster' },
        { name: 'Cloud credits      — AWS, GCP, or Azure credits', value: 'cloud_credits' },
      ],
    }]);

    const { dataset_access } = await inquirer.prompt([{
      type: 'list',
      name: 'dataset_access',
      message: 'What datasets can you realistically access?',
      choices: [
        { name: 'Open access only   — public, freely downloadable datasets', value: 'open_access_only' },
        { name: 'Kaggle             — Kaggle datasets and competition data', value: 'kaggle' },
        { name: 'University library — institutional subscriptions or licensed data', value: 'university_library' },
        { name: 'None               — I will need to collect or generate my own data', value: 'none' },
      ],
    }]);

    // ── Section 4: Your Goals ────────────────────────────────────────────────

    console.log(chalk.bold.yellow('\nSection 4 — Your Goals\n'));

    const { north_star } = await inquirer.prompt([{
      type: 'list',
      name: 'north_star',
      message: 'What is your primary goal for this research phase?',
      choices: [
        { name: 'Conference paper  — submit original work to a top venue (NeurIPS, CVPR…)', value: 'conference_paper' },
        { name: 'Thesis chapter    — build a publishable contribution for your dissertation', value: 'thesis_chapter' },
        { name: 'Survey            — read widely and synthesise an area of the literature', value: 'survey' },
        { name: 'Replication       — reproduce and stress-test an existing result', value: 'replication' },
        { name: 'Learning          — build deep understanding, no publication pressure', value: 'learning' },
      ],
    }]);

    eg('"I want to publish a paper to strengthen my grad school application"');
    const { purpose } = await inquirer.prompt([{
      type: 'input',
      name: 'purpose',
      message: 'What do you want to achieve through research?',
      validate: (v) => v.trim().length > 0 || 'Write something, even if rough.',
    }]);

    eg('"efficient training, edge AI, model compression, fairness in hiring"');
    const { interests } = await inquirer.prompt([{
      type: 'input',
      name: 'interests',
      message: 'What topics or problems excite you most right now?',
    }]);

    // ── Assemble ──────────────────────────────────────────────────────────────

    const today = new Date().toISOString().slice(0, 10);

    const profileData = {
      profile: {
        name: name.trim(),
        email: '',
        north_star_summary: '',
      },
      domain: {
        primary: primary.trim(),
        sub_areas: parseList(sub_areas),
      },
      skills: {
        level,
        programming: parseList(programming),
        tools: parseList(tools),
        math_comfort,
      },
      constraints: {
        hours_per_week,
        compute,
        dataset_access,
      },
      goals: {
        north_star,
        purpose: purpose.trim(),
        interests: parseList(interests),
      },
      status: {
        onboarded_at: today,
        last_updated: today,
      },
    };

    profileData.profile.north_star_summary = buildNorthStarSummary(profileData);

    // ── Summary table ─────────────────────────────────────────────────────────

    console.log(chalk.bold.cyan('\nYour Profile Summary\n'));

    const table = new Table({ wordWrap: true, colWidths: [20, 55] });
    table.push(
      [chalk.bold('Name'),           profileData.profile.name],
      [chalk.bold('Domain'),         profileData.domain.primary +
                                     (profileData.domain.sub_areas.length
                                       ? '  →  ' + profileData.domain.sub_areas.join(', ')
                                       : '')],
      [chalk.bold('Skill level'),    profileData.skills.level],
      [chalk.bold('Programming'),    profileData.skills.programming.join(', ') || '(none listed)'],
      [chalk.bold('Tools'),          profileData.skills.tools.join(', ')       || '(none listed)'],
      [chalk.bold('Math comfort'),   profileData.skills.math_comfort],
      [chalk.bold('Hours / week'),   String(profileData.constraints.hours_per_week)],
      [chalk.bold('Compute'),        label(profileData.constraints.compute)],
      [chalk.bold('Dataset access'), label(profileData.constraints.dataset_access)],
      [chalk.bold('North star'),     label(profileData.goals.north_star)],
      [chalk.bold('Purpose'),        profileData.goals.purpose],
      [chalk.bold('Interests'),      profileData.goals.interests.join(', ') || '(none listed)'],
    );
    console.log(table.toString());

    console.log(chalk.bold('\nResearch North Star\n'));
    console.log(chalk.italic(profileData.profile.north_star_summary));
    console.log();

    // ── Confirm ───────────────────────────────────────────────────────────────

    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: 'Does this look right?',
      default: true,
    }]);

    if (!confirmed) {
      console.log(chalk.yellow("\nNo problem — let's go through it again.\n"));
      continue;
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    try {
      writeProfile(profileData);
      console.log(chalk.bold.green('\nProfile saved to researcher.yml\n'));
      console.log(chalk.gray("Run `research-ops discover` whenever you're ready to find research directions.\n"));
    } catch (err) {
      console.error(chalk.bold.red('\nFailed to save profile:\n'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }

    break;
  }
}
