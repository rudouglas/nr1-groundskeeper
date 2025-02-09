import semver from 'semver';
import { AGENTS, RUNTIMES, STATUS } from './constants';

const LATEST = 'LATEST';
const MS_IN_DAY = 1000 * 60 * 60 * 24;

const NO_SUPPORTED_AGENT_VERSION_STATUS = {
  status: STATUS.CRITICAL,
  message: 'No supported agent version'
};

const recommendations = {
  [AGENTS.DOTNET]: {
    [RUNTIMES.DOTNET_CORE.KEY]: [
      {
        match: '2.0 - 3.0',
        version: '9.9.0',
        status: STATUS.WARNING,
        message: ''
      },
      { match: '>=3.1', version: LATEST, status: STATUS.WARNING, message: '' }
    ],
    [RUNTIMES.DOTNET_FRAMEWORK.KEY]: [
      {
        match: '<=4.0',
        version: '6.22.0',
        status: STATUS.WARNING,
        message: ''
      },
      {
        match: '4.5.0 - 4.6.1',
        version: '9.9.0',
        status: STATUS.WARNING,
        message: ''
      },
      {
        match: '>=4.6.2',
        version: LATEST,
        status: STATUS.WARNING,
        message: ''
      }
    ]
  },
  [AGENTS.GO]: [
    {
      match: '<1.7',
      version: null,
      status: STATUS.CRITICAL,
      message: 'Runtime not supported'
    },
    {
      match: '1.7 - 1.16',
      version: '3.19.1',
      status: STATUS.CRITICAL,
      message: 'Golang version out of support. Please upgrade.'
    },
    {
      match: '1.17.x',
      version: LATEST,
      status: STATUS.CRITICAL,
      message: 'Golang version out of support. Please upgrade.'
    },
    {
      match: '1.18 - 1.19.x',
      version: LATEST,
      status: STATUS.WARNING,
      message: ''
    }
  ],
  [AGENTS.JAVA]: [
    {
      match: '<=1.6.x',
      version: null,
      ...NO_SUPPORTED_AGENT_VERSION_STATUS
    },
    { match: '1.7.x', version: '6.5.4', status: STATUS.WARNING, message: '' },
    { match: '>1.7.x', version: LATEST, status: STATUS.WARNING, message: '' }
  ],
  [AGENTS.NODEJS]: [
    { match: '10.x', version: '7.5.2', status: STATUS.WARNING, message: '' },
    { match: '12.x', version: '8.17.0', status: STATUS.WARNING, message: '' },
    {
      match: '14.x || 16.x || 18.x',
      version: LATEST,
      status: STATUS.WARNING,
      message: ''
    }
  ],
  [AGENTS.PHP]: [
    {
      match: '<5.5',
      version: null,
      ...NO_SUPPORTED_AGENT_VERSION_STATUS
    },
    {
      match: '>=5.5 <7.4',
      version: LATEST,
      status: STATUS.WARNING,
      message: 'Support for runtime version is deprecated'
    },
    { match: '>=7.4', version: LATEST, status: STATUS.WARNING, message: '' }
  ],
  [AGENTS.PYTHON]: [
    {
      match: '2.7',
      version: LATEST,
      status: STATUS.WARNING,
      message: ''
    },
    {
      match: '<=3.4.x',
      version: null,
      ...NO_SUPPORTED_AGENT_VERSION_STATUS
    },
    {
      match: '3.5.x',
      version: '5.20.0.149',
      status: STATUS.WARNING,
      message: ''
    },
    {
      match: '3.6.x',
      version: '7.16.0.178',
      status: STATUS.WARNING,
      message: ''
    },
    {
      match: '>=3.7.x',
      version: LATEST,
      status: STATUS.WARNING,
      message: ''
    }
  ],
  [AGENTS.RUBY]: [
    {
      match: '<2.0.x',
      version: null,
      ...NO_SUPPORTED_AGENT_VERSION_STATUS
    },
    {
      match: '>=2.0.x <=2.1.x',
      version: '6.15.0',
      status: STATUS.WARNING,
      message: ''
    },
    {
      match: '>=2.2.x <=2.3.x',
      version: '8.16.0',
      status: STATUS.WARNING,
      message: ''
    },
    {
      match: '>2.3.x',
      rails: {
        none: {
          version: LATEST,
          status: STATUS.WARNING,
          message: ''
        },
        versions: [
          {
            match: '<3.0',
            version: null,
            ...NO_SUPPORTED_AGENT_VERSION_STATUS
          },
          {
            match: '3.0 || 3.1',
            version: '7.2.0',
            status: STATUS.WARNING,
            message: ''
          },
          {
            match: '3.2',
            version: '8.16.0',
            status: STATUS.WARNING,
            message: ''
          },
          {
            match: '>=4.0',
            version: LATEST,
            status: STATUS.WARNING,
            message: ''
          }
        ]
      }
    }
  ]
};

const recommend = (
  {
    runtimeVersions: {
      default: runtimeVersion,
      type: runtimeType,
      osVersions,
      rails: { versions: railsVersions } = {},
      zts
    } = {}
  } = {},
  { language, agentVersions: { default: currentVersion } = {} } = {},
  latestReleases,
  agentReleases
) => {
  if (!runtimeVersion || !language) return {};
  if (language === AGENTS.PHP && !isPHPAgentExists(osVersions, zts))
    return {
      statuses: [NO_SUPPORTED_AGENT_VERSION_STATUS]
    };
  let version;
  let age;
  const statuses = [];
  const agentRecommendations = runtimeType
    ? recommendations[language][runtimeKey(language, runtimeType)]
    : recommendations[language];
  if (agentRecommendations && agentRecommendations.length) {
    agentRecommendations.some(recommendation => {
      if (semver.satisfies(runtimeVersion, recommendation.match)) {
        const { version: ver, status, message } = recommendation.rails
          ? railsVersionRecommendation(railsVersions, recommendation.rails)
          : recommendation;
        version = ver === LATEST ? latestReleases[language].version : ver;
        statuses.push({ status, message });
        return true;
      }
      return false;
    });
    if (latestReleases[language].version === currentVersion) {
      statuses.push({
        status: STATUS.OK,
        message: 'Running latest version'
      });
    }
    if (version === currentVersion) {
      statuses.push({
        status: STATUS.OK,
        message: 'Running recommended version'
      });
    }
    const releases = agentReleases[language];
    if (currentVersion && releases)
      age = howOld(version, currentVersion, releases);
  }
  return { version, statuses, age };
};

const howOld = (recommendedVersion, currentVersion, releases) => {
  const { [recommendedVersion]: recVer, [currentVersion]: curVer } = releases;
  if (!recVer || !curVer) return {};
  const daysOld = Math.ceil(recVer - curVer) / MS_IN_DAY;
  if (!daysOld || daysOld < 0) return { days: 0, display: '' };
  if (daysOld > 365) {
    const [years, plural] = [Math.trunc(daysOld / 365), daysOld % 365];
    return {
      days: daysOld,
      display: `${plural ? 'over' : ''} ${years} year${
        years > 1 ? 's' : ''
      } old`
    };
  }
  if (daysOld > 30) {
    const [months, plural] = [Math.trunc(daysOld / 30), daysOld % 30];
    return {
      days: daysOld,
      display: `${plural ? 'over' : ''} ${months} month${
        months > 1 ? 's' : ''
      } old`
    };
  }
  return { days: daysOld, display: `${daysOld} days old` };
};

const runtimeKey = (language, runtimeType) => {
  if (language === AGENTS.DOTNET) {
    if (runtimeType === RUNTIMES.DOTNET_CORE.DISPLAY)
      return RUNTIMES.DOTNET_CORE.KEY;
    if (runtimeType === RUNTIMES.DOTNET_FRAMEWORK.DISPLAY)
      return RUNTIMES.DOTNET_FRAMEWORK.KEY;
  }
};

const railsVersionRecommendation = (
  railsVersions = [],
  railsRecommendations
) => {
  if (!railsVersions.length) return railsRecommendations.none;
  const lowestRailsVer = railsVersions.reduce((acc, cur) => {
    if (!acc) return cur;
    return semver.lt(cur, acc) ? cur : acc;
  });
  const rec = railsRecommendations.versions.reduce((acc, cur) => {
    if (acc) return acc;
    if (semver.satisfies(lowestRailsVer, cur.match)) return cur;
    return null;
  });
  return rec || {};
};

const isPHPAgentExists = (osVersions = [], zts) =>
  !zts &&
  osVersions.every(
    osVer => /Linux/.test(osVer) && /x86_64|amd64|aarch64|arm64/.test(osVer)
  );

export { recommend };
