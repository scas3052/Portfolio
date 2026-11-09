// All portfolio content lives here — edit this file to update the site.
import { FaGithub, FaLinkedinIn } from 'react-icons/fa6'
import {
  LuBadgeCheck,
  LuBotMessageSquare,
  LuBrainCircuit,
  LuBuilding2,
  LuChartGantt,
  LuCloud,
  LuCloudCog,
  LuDatabaseZap,
  LuFactory,
  LuLayoutDashboard,
  LuMail,
  LuMonitorSmartphone,
  LuRoute,
  LuScanSearch,
  LuServerCog,
  LuSparkles,
  LuTrendingUp,
  LuZap,
} from 'react-icons/lu'
import {
  SiAccenture,
  SiAngular,
  SiCss,
  SiDotnet,
  SiGit,
  SiGithub,
  SiHcl,
  SiHtml5,
  SiJavascript,
  SiOpencv,
  SiPython,
  SiPytorch,
  SiReact,
  SiScikitlearn,
  SiTypescript,
} from 'react-icons/si'
import { TbApi, TbBrandCSharp, TbDatabaseSearch, TbMessageChatbot, TbSql, TbVectorTriangle } from 'react-icons/tb'
import { VscAzure, VscAzureDevops } from 'react-icons/vsc'

export const profile = {
  name: 'Jalli Gopichand',
  firstName: 'Jalli',
  lastName: 'Gopichand',
  initials: 'JG',
  roles: [
    'Software Engineer',
    'Full-Stack Developer',
    'Angular + .NET Developer',
    'Azure Cloud Developer',
    'Generative AI Developer',
  ],
  tagline:
    'I build production-grade Angular + .NET apps on Azure — and GenAI assistants — that turn slow, manual, spreadsheet-driven oil & gas workflows into fast, reliable software.',
  availability: 'Currently building at Mu Sigma',
  location: 'Chennai, Tamil Nadu, India',
  email: 'itzgopi2003@gmail.com',
  phone: '+91 73864 46547',
  phoneHref: 'tel:+917386446547',
  // Drop a photo into /public and set e.g. avatar: 'avatar.jpg' to replace the monogram.
  avatar: null,
  resumeFile: 'Jalli_Gopichand_Resume.pdf',
  github: 'https://github.com/gopichand2003',
  linkedin: 'https://www.linkedin.com/in/gopichand-jalli-522935251/',
}

export const resumeUrl = `${import.meta.env.BASE_URL}${profile.resumeFile}`

export const socials = [
  { label: 'GitHub', href: profile.github, icon: FaGithub, handle: 'gopichand2003' },
  { label: 'LinkedIn', href: profile.linkedin, icon: FaLinkedinIn, handle: 'gopichand-jalli' },
  { label: 'Email', href: `mailto:${profile.email}`, icon: LuMail, handle: profile.email },
]

export const navLinks = [
  { id: 'about', label: 'About' },
  { id: 'skills', label: 'Skills' },
  { id: 'projects', label: 'Projects' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'contact', label: 'Contact' },
]

export const about = {
  paragraphs: [
    "I'm a Software Engineer at Mu Sigma, where since July 2025 I've been building production-grade decision-support applications for an upstream oil & gas client — tools that replace slow, manual, spreadsheet- and expert-driven processes with fast, reliable software.",
    'Day to day I work across the full stack: Angular front-ends, .NET (C#) Web APIs and Azure SQL, with Azure Data Factory pipelines bringing in source data, Function Apps running back-end logic, and App Service deployments shipped through Azure DevOps CI/CD. I also built FIRM LOC — a GenAI chatbot on Azure AI Foundry and Azure AI Search that classifies loss-of-containment incidents using rulebook knowledge.',
    'I hold a B.E. in Computer Science & Engineering (AI & ML) from Sathyabama Institute of Science and Technology, Chennai (CGPA 8.7). That machine-learning, computer-vision and NLP background still shapes how I approach problems — and how I bring AI into real products.',
  ],
  facts: [
    { label: 'Domain', value: 'Oil & Gas' },
    { label: 'Core stack', value: 'Angular · .NET · Azure' },
    { label: 'Degree', value: 'B.E. CSE (AI & ML)' },
    { label: 'Based in', value: 'Chennai, India' },
  ],
  stats: [
    { value: 4, label: 'Production projects' },
    { value: 1, suffix: '+', label: 'Year at Mu Sigma' },
    { value: 8.7, decimals: 1, label: 'CGPA' },
    { value: 4, label: 'Certifications' },
  ],
  services: [
    {
      icon: LuLayoutDashboard,
      title: 'Full-Stack Development',
      text: 'Responsive Angular + TypeScript front-ends backed by .NET (C#) Web APIs and SQL — built around real business workflows.',
    },
    {
      icon: LuCloudCog,
      title: 'Cloud & DevOps',
      text: 'Shipping to Azure App Service and Function Apps through Azure DevOps CI/CD pipelines, with GitHub for collaboration.',
    },
    {
      icon: LuDatabaseZap,
      title: 'Data Engineering',
      text: 'Azure Data Factory pipelines that bring source data into Azure SQL, with delta loads that keep every tool current.',
    },
    {
      icon: LuSparkles,
      title: 'Generative AI',
      text: 'RAG chatbots on Azure AI Foundry and Azure AI Search that reason over PDF knowledge stored in Blob Storage.',
    },
  ],
}

export const skillGroups = [
  {
    title: 'Frontend',
    icon: LuMonitorSmartphone,
    description: 'Responsive, component-driven interfaces.',
    skills: [
      { name: 'Angular', icon: SiAngular, color: '#dd0031' },
      { name: 'TypeScript', icon: SiTypescript, color: '#3178c6' },
      { name: 'JavaScript', icon: SiJavascript, color: '#e8c31a' },
      { name: 'HTML5', icon: SiHtml5, color: '#e34f26' },
      { name: 'CSS3', icon: SiCss, color: '#2965f1' },
      { name: 'React', icon: SiReact, color: '#1fb6e0' },
    ],
  },
  {
    title: 'Backend & Data',
    icon: LuServerCog,
    description: 'APIs, business logic and data.',
    skills: [
      { name: '.NET', icon: SiDotnet, color: '#7c5cfa' },
      { name: 'C#', icon: TbBrandCSharp, color: '#9b4f96' },
      { name: 'REST APIs', icon: TbApi, color: '#10b981' },
      { name: 'SQL / Azure SQL', icon: TbSql, color: '#38bdf8' },
      { name: 'Python', icon: SiPython, color: '#4b8bbe' },
    ],
  },
  {
    title: 'Cloud & DevOps',
    icon: LuCloudCog,
    description: 'Building, shipping and running on Azure.',
    skills: [
      { name: 'Azure App Service', icon: VscAzure, color: '#0089d6' },
      { name: 'Azure Function Apps', icon: LuZap, color: '#f2b705' },
      { name: 'Azure Data Factory', icon: LuFactory, color: '#3b9ae1' },
      { name: 'Azure DevOps CI/CD', icon: VscAzureDevops, color: '#0078d4' },
      { name: 'Blob Storage', icon: LuCloud, color: '#5ea0ef' },
      { name: 'GitHub', icon: SiGithub },
      { name: 'Git', icon: SiGit, color: '#f05032' },
    ],
  },
  {
    title: 'AI & Machine Learning',
    icon: LuBrainCircuit,
    description: 'From classic ML to production GenAI.',
    skills: [
      { name: 'Azure AI Foundry', icon: LuSparkles, color: '#a78bfa' },
      { name: 'Azure AI Search', icon: TbDatabaseSearch, color: '#0ea5e9' },
      { name: 'RAG & Vector Search', icon: TbVectorTriangle, color: '#ec4899' },
      { name: 'scikit-learn', icon: SiScikitlearn, color: '#f7931e' },
      { name: 'PyTorch', icon: SiPytorch, color: '#ee4c2c' },
      { name: 'OpenCV', icon: SiOpencv, color: '#5c3ee8' },
      { name: 'NLTK', icon: TbMessageChatbot, color: '#10b981' },
    ],
  },
]

export const concepts = [
  'Full-Stack Development',
  'REST API Design',
  'CI/CD',
  'Cloud Deployment',
  'Retrieval-Augmented Generation',
  'ETL & Data Pipelines',
  'Machine Learning',
  'Object-Oriented Programming',
  'Data Structures',
]

export const marquee = [
  { name: 'Angular', icon: SiAngular },
  { name: 'TypeScript', icon: SiTypescript },
  { name: '.NET', icon: SiDotnet },
  { name: 'C#', icon: TbBrandCSharp },
  { name: 'Azure', icon: VscAzure },
  { name: 'Azure DevOps', icon: VscAzureDevops },
  { name: 'Function Apps', icon: LuZap },
  { name: 'Data Factory', icon: LuFactory },
  { name: 'Azure SQL', icon: TbSql },
  { name: 'AI Foundry', icon: LuSparkles },
  { name: 'AI Search', icon: TbDatabaseSearch },
  { name: 'Python', icon: SiPython },
  { name: 'GitHub', icon: SiGithub },
  { name: 'Git', icon: SiGit },
  { name: 'React', icon: SiReact },
  { name: 'PyTorch', icon: SiPytorch },
  { name: 'OpenCV', icon: SiOpencv },
]

export const projectFilters = ['All', 'Production', 'Full-Stack', 'AI / ML', 'Academic']

// `repo`, `org` and `highlights` are optional. Projects without a public repo show a
// "Built at {org} · Proprietary code" badge instead of a GitHub link.
export const projects = [
  {
    title: 'FIRM LOC Chatbot',
    icon: LuBotMessageSquare,
    categories: ['Production', 'AI / ML'],
    colors: ['#f97316', '#db2777'],
    org: 'Mu Sigma',
    description:
      'A GenAI assistant that classifies oil & gas loss-of-containment (LOC) incidents into severity tiers — replacing a slow, expert-only manual review of rulebooks.',
    highlights: [
      'Interviews field workers conversationally to collect every required detail',
      'RAG over rulebook PDFs: Blob Storage → Azure AI Search vectors',
      'Assigns Tier 1, 2 or 3 so incidents reach approval faster',
    ],
    tech: ['Python', 'Azure AI Foundry', 'Azure AI Search', 'Blob Storage', 'RAG'],
  },
  {
    title: 'Workover Rig Scheduler',
    icon: LuRoute,
    categories: ['Production', 'Full-Stack'],
    colors: ['#0ea5e9', '#4f46e5'],
    org: 'Mu Sigma',
    description:
      'An optimisation-driven scheduler that tells each workover rig which wells to service next — turning a manual, experience-dependent process into a data-driven one.',
    highlights: [
      'Ranks wells by Cashflow, BOE or PVI value',
      'Honours road closures, rig types, locked wells and pad rules',
      'Source data synced through Data Factory pipelines and delta loads',
    ],
    tech: ['Angular', '.NET', 'Function Apps', 'Data Factory', 'Azure SQL', 'App Service', 'Azure DevOps'],
  },
  {
    title: 'Drillout & FAL Scheduler',
    icon: LuChartGantt,
    categories: ['Production', 'Full-Stack'],
    colors: ['#10b981', '#0e7490'],
    org: 'Mu Sigma',
    description:
      'A scheduling platform for the post-frac well lifecycle — coil, snubbing and workover rigs, drillout and FAL — replacing two Excel trackers with one real-time source of truth.',
    highlights: [
      'Assign pads to rigs, move pads between rigs or add new rigs',
      'Shift drillout start and end dates with live timeline updates',
      'Built to push rig utilisation toward 100%',
    ],
    tech: ['Angular', '.NET', 'Function Apps', 'Data Factory', 'Azure SQL', 'App Service', 'Azure DevOps'],
  },
  {
    title: 'Initiative & Impact (I&I)',
    icon: LuTrendingUp,
    categories: ['Production', 'Full-Stack'],
    colors: ['#8b5cf6', '#c026d3'],
    org: 'Mu Sigma',
    description:
      'A centralised platform that follows every operational-improvement initiative from idea to measurable impact for a Shale & Tight business unit.',
    highlights: [
      'Tracks L1–L5 approvals with clear ownership at every level',
      "Maps approved initiatives to the pads and wells where they're implemented",
      'KPI-based tracking of savings, production and productivity impact',
    ],
    tech: ['Angular', '.NET', 'Data Factory', 'Azure SQL', 'App Service', 'Azure DevOps'],
  },
  {
    title: 'Fake Logo Detection',
    icon: LuScanSearch,
    categories: ['Academic', 'AI / ML'],
    colors: ['#6366f1', '#06b6d4'],
    description:
      'A counterfeit-logo detection system that classifies brand logos as genuine or fake from images — built to support fraud detection and brand protection.',
    tech: ['Python', 'OpenCV', 'scikit-learn', 'Keras', 'PyTorch'],
    repo: 'https://github.com/gopichand2003/Fake-Logo-Detection',
  },
  {
    title: 'Restaurant Review Analysis',
    icon: TbMessageChatbot,
    categories: ['Academic', 'AI / ML'],
    colors: ['#f59e0b', '#ef4444'],
    description:
      'An NLP pipeline that cleans and analyses restaurant reviews to classify sentiment and surface actionable insights from customer feedback.',
    tech: ['Python', 'NLTK', 'scikit-learn', 'Pandas', 'NumPy', 'Regex'],
    repo: 'https://github.com/gopichand2003/Restaurant-Review-Using-NLP',
  },
]

export const experience = [
  {
    company: 'Mu Sigma',
    logo: LuBuilding2,
    role: 'Software Engineer',
    type: 'Full-time',
    period: 'Jul 2025 – Present',
    summary:
      'Building production-grade decision-support tools for an upstream oil & gas client — from Angular front-ends and .NET APIs to Azure data pipelines and GenAI.',
    points: [
      'Develop production Angular + .NET (C#) applications — Workover Rig Scheduler, Drillout & FAL Scheduler and Initiative & Impact — that replace manual, spreadsheet-driven workflows.',
      'Ship to Azure App Service through Azure DevOps CI/CD pipelines and collaborate with the team on GitHub.',
      'Run back-end scheduling logic on Azure Function Apps, with Azure Data Factory pipelines bringing source data into Azure SQL.',
      'Built FIRM LOC — a GenAI chatbot on Azure AI Foundry and Azure AI Search that interviews field workers and classifies loss-of-containment incidents into Tiers 1–3.',
    ],
    tags: ['Angular', '.NET', 'C#', 'Azure', 'Data Factory', 'Azure DevOps', 'GenAI'],
  },
  {
    company: 'HCL Technologies Limited',
    logo: SiHcl,
    role: 'Mini-Project Based Intern',
    type: 'Internship',
    summary:
      'Worked in a team on real-world problem statements provided by HCL, taking each one from an idea to a working, automated solution.',
    points: [
      'Analysed real-world problem statements and conceptualised practical solutions with the team.',
      'Automated workflows and embedded the relevant technologies to turn concepts into working prototypes.',
      'Collaborated closely with teammates, gaining first-hand exposure to how industry projects are scoped and delivered.',
    ],
    tags: ['Problem Solving', 'Automation', 'Teamwork', 'Industry Exposure'],
  },
]

export const education = [
  {
    institution: 'Sathyabama Institute of Science and Technology',
    degree: 'B.E. Computer Science & Engineering (AI & ML)',
    period: '2021 – 2025',
    location: 'Chennai, Tamil Nadu',
    score: 'CGPA 8.7',
  },
  {
    institution: 'Sri Chaitanya Junior College',
    degree: 'Intermediate (Class XII) — MPC',
    period: '2019 – 2021',
    location: 'Vijayawada, Andhra Pradesh',
    score: '92.9%',
  },
  {
    institution: 'Sri Chaitanya High School',
    degree: 'Secondary School (Class X)',
    period: '2018 – 2019',
    location: 'Narsapur, Andhra Pradesh',
    score: 'CGPA 9.7',
  },
]

export const certifications = [
  { title: 'Certified System Administrator', issuer: 'ServiceNow', date: 'Sep 2024', icon: LuBadgeCheck },
  { title: 'Professional Training on Machine Learning', issuer: 'Cognibot', date: 'Jan – Apr 2024', icon: LuBrainCircuit },
  { title: 'Digital Skills: Artificial Intelligence', issuer: 'Accenture', date: 'Jun 2023', icon: SiAccenture },
  { title: 'Industrial Program on Machine Learning', issuer: '1StopAI', date: 'Oct – Nov 2022', icon: LuSparkles },
]
