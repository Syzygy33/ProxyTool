const clashConfig = {
  custom: {
    rulesets: [
      { name: "☘️ 微软服务", value: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Microsoft/Microsoft.list" },
      { name: "🍎 苹果服务", value: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Apple/Apple.list" },
      { name: "🎡 开源社区", value: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GitHub/GitHub.list" },
      { name: "🎯 谷歌应用", value: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Google/Google.list" },
      { name: "🥝 人工智能", value: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OpenAI/OpenAI.list" },
      { name: "💢 广告拦截", value: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/refs/heads/master/rule/Clash/AdvertisingLite/AdvertisingLite.list" },
      { name: "🌏 国内站点", value: ["GEOIP", "LAN"] },
      { name: "🌏 国内站点", value: ["GEOIP", "CN"] },
      { name: "🐸 漏网之鱼", value: ["FINAL"] }
    ],
    proxyGroups: [
      {
        name: "♻️ 代理模式",
        type: "select",
        proxies: ["🌸 香港节点", "🛸 美国节点", "🌞 日本节点", "🦁 狮城节点", "🐯 韩国节点", "🐨 台湾节点"]
      },
      {
        name: "🌏 国内站点",
        type: "select",
        proxies: ["🌀 直连模式", "♻️ 代理模式"]
      },
      {
        name: "🥝 人工智能",
        type: "select",
        proxies: ["🌸 香港节点", "🛸 美国节点", "🌞 日本节点", "🦁 狮城节点", "🐯 韩国节点", "🐨 台湾节点"]
      },
      {
        name: "🎡 开源社区",
        type: "select",
        proxies: ["🌸 香港节点", "🛸 美国节点", "🌞 日本节点", "🦁 狮城节点", "🐯 韩国节点", "🐨 台湾节点"]
      },
      {
        name: "🎯 谷歌应用",
        type: "select",
        proxies: ["♻️ 代理模式", "🌀 直连模式"]
      },
      {
        name: "☘️ 微软服务",
        type: "select",
        proxies: ["♻️ 代理模式", "🌀 直连模式"]
      },
      {
        name: "🍎 苹果服务",
        type: "select",
        proxies: ["🌀 直连模式", "🌸 香港节点", "🛸 美国节点", "🌞 日本节点"]
      },
      {
        name: "🐸 漏网之鱼",
        type: "select",
        proxies: ["♻️ 代理模式", "🌀 直连模式"]
      },
      {
        name: "🌀 直连模式",
        type: "select",
        proxies: ["DIRECT"]
      },
      {
        name: "💢 广告拦截",
        type: "select",
        proxies: ["REJECT", "DIRECT"]
      },
      {
        name: "🌸 香港节点",
        type: "url-test",
        filter: "(港|香港|HK|Hong Kong)",
        url: "http://www.gstatic.com/generate_204",
        interval: 900,
        tolerance: 50
      },
      {
        name: "🌞 日本节点",
        type: "url-test",
        filter: "(日本|日|JP|Japan)",
        url: "http://www.gstatic.com/generate_204",
        interval: 900,
        tolerance: 50
      },
      {
        name: "🛸 美国节点",
        type: "url-test",
        filter: "(美|波特兰|美国|US|United States)",
        url: "http://www.gstatic.com/generate_204",
        interval: 900,
        tolerance: 50
      },
      {
        name: "🐨 台湾节点",
        type: "url-test",
        filter: "(台|台湾|TW|Taiwan)",
        url: "http://www.gstatic.com/generate_204",
        interval: 900,
        tolerance: 50
      },
      {
        name: "🦁 狮城节点",
        type: "url-test",
        filter: "(新加坡|坡|狮城|SG|Singapore)",
        url: "http://www.gstatic.com/generate_204",
        interval: 900,
        tolerance: 50
      },
      {
        name: "🐯 韩国节点",
        type: "url-test",
        filter: "(KR|Korea|KOR|韩国|韩|韓)",
        url: "http://www.gstatic.com/generate_204",
        interval: 900,
        tolerance: 50
      }
    ],
    flags: {
      enable_rule_generator: true,
      overwrite_original_rules: true
    }
  }
};
