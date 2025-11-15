function main(config) {
  config["proxy-groups"] = [
    {
      name: "代理模式",
      icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/Catnet.png",
      type: "select",
      proxies: [
        "香港节点", "美国节点", "日本节点", "台湾节点", "狮城节点", "韩国节点"
      ]
    },
    {
      name: "直连模式",
      icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/Rookie.png",
      type: "select",
      proxies: [
        "DIRECT"
      ]
    },
    {
      name: "国内站点",
      icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/StreamingCN.png",
      type: "select",
      proxies: [
        "直连模式", "代理模式"
      ]
    },
    {
      name: "人工智能",
      icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/STC.png",
      type: "select",
      proxies: [
        "香港节点", "美国节点", "日本节点", "台湾节点", "狮城节点", "韩国节点"
      ]
    },
    {
      name: "开源社区",
      icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/Godetia.png",
      type: "select",
      proxies: [
        "香港节点", "美国节点", "日本节点", "台湾节点", "狮城节点", "韩国节点"
      ]
    },
    {
      name: "谷歌应用",
      icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/Dukou.png",
      type: "select",
      proxies: [
        "代理模式", "直连模式"
      ]
    },
    {
      name: "微软服务",
      icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/Pacifique.png",
      type: "select",
      proxies: [
        "代理模式", "直连模式"
      ]
    },
    {
      name: "苹果服务",
      icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/GLaDOS.png",
      type: "select",
      proxies: [
        "代理模式", "直连模式"
      ]
    },
    {
      name: "漏网之鱼",
      icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/Bywave.png",
      type: "select",
      proxies: [
        "代理模式", "直连模式"
      ]
    },
    {
      name: "广告拦截",
      icon: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/Boom.png",
      type: "select",
      proxies: [
        "REJECT", "DIRECT"
      ]
    },
    {
      name: "香港节点",
      icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/HK_02.png",
      "include-all": true,
      filter: "(?i)港|HK|hk|Hong Kong|HongKong|hongkong",
      type: "url-test",
      interval: 300,
      tolerance: 50
    },
    {
      name: "台湾节点",
      icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/TW_02.png",
      "include-all": true,
      filter: "(?i)台|新北|彰化|TW|Taiwan",
      type: "url-test",
      interval: 300,
      tolerance: 50
    },
    {
      name: "狮城节点",
      icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/SG_01.png",
      "include-all": true,
      filter: "(?i)新加坡|坡|狮城|SG|Singapore",
      type: "url-test",
      interval: 300,
      tolerance: 50
    },
    {
      name: "美国节点",
      icon: "icon: https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/US.png",
      "include-all": true,
      filter: "(?i)美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|US|United States",
      type: "url-test",
      interval: 300,
      tolerance: 50
    },
    {
      name: "日本节点",
      icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/JP_01.png",
      "include-all": true,
      filter: "(?i)日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan",
      type: "url-test",
      interval: 300,
      tolerance: 50
    },
    {
      name: "韩国节点",
      icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/KR_01.png",
      "include-all": true,
      filter: "(?i)KR|Korea|KOR|首尔|韩|韓",
      type: "url-test",
      interval: 300,
      tolerance: 50
    },
  ];
  config["rule-providers"] = {
    Microsoft: {
      url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Microsoft/Microsoft.list",
      path: "./ruleset/Microsoft.list",
      behavior: "classical",
      interval: 86400,
      format: "text",
      type: "http"
    },
    Apple: {
      url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Apple/Apple.list",
      path: "./ruleset/Apple.list",
      behavior: "classical",
      interval: 86400,
      format: "text",
      type: "http"
    },
    GitHub: {
      url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GitHub/GitHub.list",
      path: "./ruleset/GitHub.list",
      behavior: "classical",
      interval: 86400,
      format: "text",
      type: "http"
    },
    Google: {
      url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Google/Google.list",
      path: "./ruleset/Google.list",
      behavior: "classical",
      interval: 86400,
      format: "text",
      type: "http"
    },
    OpenAI: {
      url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OpenAI/OpenAI.list",
      path: "./ruleset/OpenAI.list",
      behavior: "classical",
      interval: 86400,
      format: "text",
      type: "http"
    },
    AdvertisingLite: {
      url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/refs/heads/master/rule/Clash/AdvertisingLite/AdvertisingLite.list",
      path: "./ruleset/AdvertisingLite.list",
      behavior: "classical",
      interval: 86400,
      format: "text",
      type: "http"
    },
  };
  config["rules"] = [
    "RULE-SET, Microsoft,微软服务",
    "RULE-SET,Apple,苹果服务",
    "RULE-SET,GitHub,开源社区",
    "RULE-SET,Google,谷歌应用",
    "RULE-SET,OpenAI,人工智能",
    "RULE-SET,AdvertisingLite,广告拦截",
    "GEOIP,CN,国内站点",
    "MATCH,漏网之鱼"
  ];
  return config;
}
