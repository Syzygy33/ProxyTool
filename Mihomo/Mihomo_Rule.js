// Clash_rule.js V5.12
// 需较新的 mihomo 内核；首次启动联网下载规则集与 geo 数据，在日志确认全部下载成功。
// V5.6：代码整体精简，逻辑与 V5.5 完全一致；
//       直连相关分流由 RULE-SET 改为内置 GEOSITE/GEOIP：private / cn 四项不再下载规则集，
//       DNS 的 fake-ip-filter 与 nameserver-policy 对应键同步改为 geosite:private / geosite:cn。
// V5.7：新增性能段（集中在顶部「性能：内存占用 / 连接速度」常量）：
//       geodata-mode:false（GEOIP 用 mmdb 按需换页，不整体驻留内存）+ geodata-loader:memconservative
//       + geosite-matcher:succinct；geo 数据走 jsdmirror 镜像（默认 GitHub 常被墙，拿不到则 GEOIP/GEOSITE 全失效）；
//       空闲连接保活由 300s 降到 180s，减少常驻 socket。其它分流/组结构与 V5.6 一致。
// V5.8：删除 proxy-domain（geolocation-!cn，194KB，规则集中最大的一块），境外域名直接落 MATCH 由「漏网之鱼」接管
//       （该组默认出口就是代理模式，结果一致；代价是该组手动切直连时境外域名也一并直连）。
//       规则顺序改为「基础设施 → 广告拦截 → 国内地区 → 应用分流 → MATCH」：国内流量从第 4 条起命中，
//       跳过后面 7 条规则集；广告拦截仍排在国内之前，国内广告域名才不会被当成普通国内站点放行。
//       组结构：代理模式 / 直连模式 / 国内站点 / 6 应用组 / 广告拦截 / 漏网之鱼 / 6 地区组（面板最下方）。
// V5.9：删除「谷歌应用」分流（组、google-domain 规则集、RULE-SET 规则一并移除）。
//       谷歌流量落 MATCH 由「漏网之鱼」接管（该组默认出口为代理模式，效果一致）；
//       若需单独控制，可在 apps 数组与规则里按原样加回。组结构：6 应用组 → 5 应用组。
// V5.10：国内分流去掉 GEOSITE,cn，改为单条 GEOIP,cn →「国内站点」组（原 GEOIP,cn 直连的写法取消）。
//       纯 IP 判断生效的前提：dns.fake-ip-filter 的 geosite:cn 让国内域名拿到真实 IP（该行已标注为关键项，勿删）。
//       副作用：解析到境外 IP 的国内站点不再被兜住，会落到 MATCH→漏网之鱼（默认代理模式）。
// V5.11：补回国内域名兜底——新增 cn-domain 规则集（geosite/cn，520KB），
//       规则为「GEOIP,cn → 国内站点」在前、「RULE-SET,cn-domain → 国内站点」紧随其后兜底：
//       IP 判优先，判不到的国内站点按域名捞回，不再掉进 MATCH 走代理。
//       DNS 侧的 fake-ip-filter 与 nameserver-policy 同步由 geosite:cn 改为 rule-set:cn-domain，
//       与分流共用同一份数据（口径一致，且不再依赖内置 geosite:cn 条目）。
// V5.12：修 Google Play 下载/更新「等待中」——加 DOMAIN-SUFFIX,googleapis.cn → 代理模式，且必须排在
//       国内分流之前。services.googleapis.cn 解析到境内 IP（120.253.x.x，实测），被判国内直连后
//       Play 拿到的是 Google 国内 CDN 地址，再用代理去连国内 CDN 会被拒（国内 CDN 封境外出口），
//       于是永远等待中；走代理则 Play 返回国外 CDN 地址，下载链路与代理一致。

// ── 可调参数（集中维护） ──
const DEFAULT_IP_VERSION = "dual"; // dual(并发择优) / ipv6-prefer / ipv4-prefer
const REGION_MIN_NODES = 2;        // 达到该值才建组；provider 订阅时节点不可见，不参与判断
const RS_INTERVAL = 604800;        // 规则集更新周期：一周
const CN_DNS_DOH = ["https://223.5.5.5/dns-query", "https://doh.pub/dns-query"];
const CN_DNS_PLAIN = ["223.5.5.5", "119.29.29.29"];
const TEST_URL_PROXY = "https://www.gstatic.com/generate_204";
const PREFER_H3 = false;           // DoH 并发尝试 HTTP/3：UDP 被限速或不支持时反而更慢
const BLOCK_QUIC = false;          // 拒绝 UDP 443 迫使回退 TCP；仅节点不支持 UDP 时开（国内直连 QUIC 会一并回退）

// ── 性能：内存占用 / 连接速度 ──
// false：GEOIP 用 mmdb（mmap 按需换页，常驻内存小，7MB 文件不会整体驻留）；
// true：用 .dat（整体载入内存，约 16MB），查询更快但内存高
const GEO_DATA_MODE = false;
const GEO_LOADER = "memconservative"; // .dat 加载器（geosite.dat 必用 .dat）：memconservative 低内存 / standard 高内存快
const GEO_SITE_MATCHER = "succinct";  // 域名匹配器：succinct 压缩结构省内存 / mph 哈希查询略快但内存高
// geo 数据下载地址：默认 GitHub 域名直连常被墙，改镜像可让首次启动拿到数据（否则 GEOIP/GEOSITE 全部不生效）。
// mmdb 供 geodata-mode:false 用（7MB），geoip 供 geodata-mode:true 用（16MB），geosite 恒为 .dat（4MB）
const GEOX_URL = {
    mmdb: "https://cdn.jsdmirror.com/gh/MetaCubeX/meta-rules-dat@release/country.mmdb",
    geoip: "https://cdn.jsdmirror.com/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
    geosite: "https://cdn.jsdmirror.com/gh/MetaCubeX/meta-rules-dat@release/geosite.dat"
};
// 空闲连接保活（秒）：idle 越小常驻 socket 越少、内存越省；调大省电但残留连接多
const KEEP_ALIVE_IDLE = 180;
const KEEP_ALIVE_INTERVAL = 30; // 保活探测间隔（秒）

// 部分客户端脚本引擎无 console.warn：统一经此降级输出，避免 TypeError 中断转换
const warnLog = (...args) => {
    if (typeof console === "undefined") return;
    if (typeof console.warn === "function") console.warn(...args);
    else if (typeof console.log === "function") console.log(...args);
};

const isObj = value => !!value && typeof value === "object" && !Array.isArray(value);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function main(params) {
    if (!isObj(params)) params = {};
    if (!Array.isArray(params.proxies)) params.proxies = [];

    // 内核要求节点名非空且唯一，空名/非法条目会让整份配置启动失败，直接丢弃
    params.proxies = params.proxies.filter(p => p && typeof p.name === "string" && p.name !== "");

    // 记住面板手动选择与 fake-ip 缓存；订阅已设置的项以订阅为准
    params.profile = Object.assign(
        { "store-selected": true, "store-fake-ip": true },
        isObj(params.profile) ? params.profile : {}
    );

    // 订阅自身是否使用代理集合（决定地区组是全量还是按节点数筛选）
    const subHasProviders = Object.keys(params["proxy-providers"] || {}).length > 0;
    // 订阅原始 rule-providers 快照：判断 rule-set: 依赖是否确有定义，须在下方覆写前读取
    const subRuleProviders = Object.assign({}, params["rule-providers"] || {});

    Object.assign(params, {
        "unified-delay": true, // 延迟只算请求往返，去掉握手开销
        "tcp-concurrent": true, // 双栈下并发建连择优（Happy Eyeballs），首包更快
        "find-process-mode": "off", // 不匹配进程名，省掉每条连接的进程查找（进程表是全内核共享的大头内存）
        "keep-alive-idle": KEEP_ALIVE_IDLE,
        "keep-alive-interval": KEEP_ALIVE_INTERVAL,
        // geo 数据：mode=false 走 mmdb 省内存，loader/matcher 取省内存档
        "geodata-mode": GEO_DATA_MODE,
        "geodata-loader": GEO_LOADER,
        "geosite-matcher": GEO_SITE_MATCHER,
        // 订阅自带 geox-url 的键优先（同名键覆盖），其余补镜像
        "geox-url": Object.assign({}, GEOX_URL, isObj(params["geox-url"]) ? params["geox-url"] : {})
    });
    // IPv6 仅订阅显式开启才开启（避免纯 IPv4 下双栈重试与 AAAA fake-ip 兼容问题）
    const ipv6Enabled = params.ipv6 === true;
    params.ipv6 = ipv6Enabled;
    delete params["global-client-fingerprint"]; // 内核已移除该字段并会在启动时报错

    params.sniffer = {
        enable: true,
        "force-dns-mapping": true,
        "parse-pure-ip": true, // 纯 IP 流量从 TLS SNI / HTTP Host 还原域名参与分流，避免兜底误判
        "override-destination": true,
        sniff: {
            HTTP: { ports: [80, "8080-8880"], "override-destination": true },
            TLS: { ports: [443, 8443] },
            QUIC: { ports: [443, 8443] }
        },
        // "Mijia Cloud" 不是域名，现行内核对 skip-domain 按域名模式校验，单标签按精确匹配处理；
        // 米家设备 SNI 恰好就是它，可命中并跳过嗅探；并非子串匹配，SNI 带前后缀时不生效
        "skip-domain": [
            "Mijia Cloud",
            "+.apple.com",
            "+.openai.com",
            "+.oaistatic.com",
            "+.oaiusercontent.com",
            "+.chatgpt.com"
        ]
    };

    // 节点名里的信息类关键词（剩余流量、到期时间、群链接等），不该被地区测速组当成可用节点。
    // 内核 group filter 是 Go 正则（(?i) 合法），JS 侧经 toJsRegex 转换，两处共用同一串
    const excludeFilter = "(?i)(剩余|官网|套餐|流量|到期|过期|更新|刷新|订阅|群|网址|客服|欢迎|加入|Expire|Traffic|Reset|(^|[^A-Za-z0-9])(\\d+(\\.\\d+)?\\s*(GB|TB)|\\d+\\s*Days?)([^A-Za-z0-9]|$))";

    // 地区表：6 个（香港/日本/美国/狮城/台湾/韩国），组名即「XX节点」
    const regions = [
        { name: "香港节点", regex: "(?i)(香港|🇭🇰|(^|[^A-Za-z])HK([^A-Za-z]|$)|(^|[^A-Za-z])HKG([^A-Za-z]|$)|Hong[ -]?Kong)", icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/HK_02.png" },
        { name: "日本节点", regex: "(?i)(日本|东京|東京|大阪|🇯🇵|(^|[^A-Za-z])JP([^A-Za-z]|$)|(^|[^A-Za-z])JPN([^A-Za-z]|$)|Japan)", icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/JP_01.png" },
        { name: "美国节点", regex: "(?i)(美国|美國|洛杉矶|洛杉磯|圣何塞|聖何塞|硅谷|矽谷|西雅图|西雅圖|纽约|紐約|🇺🇸|(^|[^A-Za-z])US([^A-Za-z]|$)|(^|[^A-Za-z])USA([^A-Za-z]|$)|United[ -]?States)", icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/US.png" },
        { name: "狮城节点", regex: "(?i)(新加坡|狮城|獅城|🇸🇬|(^|[^A-Za-z])SG([^A-Za-z]|$)|(^|[^A-Za-z])SGP([^A-Za-z]|$)|Singapore)", icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/SG_01.png" },
        { name: "台湾节点", regex: "(?i)(台湾|台灣|台北|新北|🇹🇼|(^|[^A-Za-z])TW([^A-Za-z]|$)|(^|[^A-Za-z])TWN([^A-Za-z]|$)|Taiwan)", icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/TW_02.png" },
        { name: "韩国节点", regex: "(?i)(韩国|韓國|南韩|南韓|首尔|首爾|🇰🇷|(^|[^A-Za-z])KR([^A-Za-z]|$)|(^|[^A-Za-z])KOR([^A-Za-z]|$)|Korea)", icon: "https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/flag/KR_01.png" }
    ];

    // 应用组名单与图标。已移除的 谷歌/TV/Spotify/Twitch/X/TikTok/YouTube 不设独立组，其流量落 MATCH 由「漏网之鱼」接管
    const apps = [
        { name: "人工智能", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Bot.png" },
        { name: "电报消息", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Telegram.png" },
        { name: "苹果服务", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Apple_2.png" },
        { name: "开源社区", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/GitHub.png" },
        { name: "微软服务", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/OneDrive.png" }
    ];

    // 这些应用组的切换目标只有 6 个地区组，其余应用组列「代理模式」+「直连模式」
    const REGION_ONLY_APPS = new Set(["人工智能", "开源社区"]);
    const OWN_GROUPS = ["代理模式", "直连模式", "国内站点", "漏网之鱼", "广告拦截", ...apps.map(app => app.name)];
    // 内核中 RULES 由内核单独特判：DNS 连接按路由规则出站，不查策略表
    const BUILTIN_POLICIES = new Set(["DIRECT", "REJECT", "REJECT-DROP", "COMPATIBLE", "PASS", "PASS-RULE", "GLOBAL", "RULES"]);

    // 内核中节点与策略组共享同一命名空间且要求节点名唯一：与自建组/地区组/内建 outbound 重名的节点、
    // 以及订阅内的重名节点，都会让内核启动报错，抢先改名。须在地区统计、PROXY_NAMES 收集与组生成前完成；
    // 改名后的节点名照常参与地区分类（如 "节点·US" 仍命中 US 正则的独立 token 条件）
    const RESERVED_NAMES = new Set([...OWN_GROUPS, ...regions.map(r => r.name), ...BUILTIN_POLICIES]);

    const usedProxyNames = new Set();

    params.proxies.forEach(proxy => {
        let name = proxy.name;

        if (RESERVED_NAMES.has(name) || usedProxyNames.has(name)) {
            const reservedHit = RESERVED_NAMES.has(name);
            let candidate = name;
            let suffix = 0;

            do {
                suffix++;
                candidate = reservedHit
                    ? "节点·" + name + (suffix > 1 ? "·" + suffix : "")
                    : name + "·" + suffix;
            } while (RESERVED_NAMES.has(candidate) || usedProxyNames.has(candidate));

            name = candidate;
            proxy.name = name;
        }

        usedProxyNames.add(name);
    });

    const toJsRegex = goStyleRegex => new RegExp(goStyleRegex.replace(/^\(\?i\)/, ""), "i");
    // direct / reject 类型不进任何可选组，与下方组的 exclude-type 保持一致
    const allProxies = params.proxies.filter(p => p.type !== "direct" && p.type !== "reject");
    const excludeRe = toJsRegex(excludeFilter);

    const activeRegions = subHasProviders
        ? regions // provider 订阅时脚本期看不到节点，维持全量地区组
        : regions.filter(({ regex }) => {
              const re = toJsRegex(regex);
              let count = 0;

              for (const proxy of allProxies) {
                  if (re.test(proxy.name) && !excludeRe.test(proxy.name) && ++count >= REGION_MIN_NODES) {
                      return true;
                  }
              }

              return false;
          });
    const hasActiveRegions = activeRegions.length > 0;

    // ── 订阅 DNS 悬空引用清洗 ──
    // 订阅 DNS 里指向已重建规则集/策略组的 "rule-set:" 键、"#组名" 后缀原样并入会硬报错；
    // geosite:/geoip: 引用会触发内核额外下载 geo 文件，均须清洗。脚本自身引用在下方独立写入，不受影响

    // 取自实际会建组的 activeRegions，避免引用到节点不足未建组的地区（内核找不到目标组）
    const REGION_NAMES = new Set(activeRegions.map(r => r.name));
    // 本地节点名并入合法引用集："#节点名" 指定解析节点是内核支持的写法，不识别会被误剥；provider 订阅下该集合为空
    const PROXY_NAMES = new Set(allProxies.map(p => p && p.name).filter(Boolean));

    const refValid = ref =>
        BUILTIN_POLICIES.has(ref) ||
        OWN_GROUPS.indexOf(ref) !== -1 ||
        REGION_NAMES.has(ref) ||
        PROXY_NAMES.has(ref);

    const stringList = value => {
        if (value === undefined || value === null) return [];

        return (Array.isArray(value) ? value : [value])
            .filter(item => typeof item === "string")
            .map(item => item.trim())
            .filter(Boolean);
    };

    // 解析 nameserver-policy / proxy-server-nameserver-policy 的 "rule-set:a,b" 逗号多值键
    const ruleSetNames = key => {
        const match = /^rule-set:(.+)$/i.exec(String(key));
        if (!match) return [];

        return match[1].split(",").map(name => name.trim()).filter(Boolean);
    };

    // 内核按 config.parseNameServer 解析 # 后片段（按 "&" 分段）：含 "=" 的是参数（h3=/ecs= 等）原样保留，
    // 不含的是目标名，被误当网卡名会运行期静默失败，故需校验。keepBare 控制是否保留裸段
    const stripRef = (entry, keepBare) => {
        const s = String(entry);
        const hash = s.indexOf("#");
        if (hash === -1) return s;

        const kept = s.slice(hash + 1)
            .split("&")
            .map(part => part.trim())
            .filter(part => part !== "" && (part.includes("=") || (keepBare && refValid(part))));

        if (kept.length > 0) return s.slice(0, hash) + "#" + kept.join("&");
        // 悬空引用时：节点 DNS 直接剥掉节点/组引用，普通 DNS 补 #RULES 交给路由决定
        // （剥成裸 URL 直连会同时招致污染与泄漏）
        return s.slice(0, hash) + (keepBare ? "#RULES" : "");
    };
    const stripDanglingRef = entry => stripRef(entry, true);
    // 节点解析 DNS 不得经代理/策略组出站，否则形成"需要节点才能解析节点"的循环
    const stripProxyRefs = entry => stripRef(entry, false);

    const stripProxyRefsPolicy = policy => {
        const out = {};

        for (const key of Object.keys(policy)) {
            out[key] = stringList(policy[key]).map(stripProxyRefs);
        }

        return out;
    };

    // ── 读取订阅 DNS ──
    // 无"拒绝生成"分支：不可迁移字段一律静默丢弃、以脚本配置为准，永远输出完整配置；
    // 仅读取被异常打断时放弃订阅 DNS 整段（外层 catch 按无 DNS 处理）
    const deriveSubDNS = rawDNS => {
        const subDNS = isObj(rawDNS) ? rawDNS : {};

        const subPSN = stringList(subDNS["proxy-server-nameserver"]).map(stripDanglingRef);
        const subNS = stringList(subDNS.nameserver).map(stripDanglingRef);
        const subPolicy = Object.assign({}, isObj(subDNS["nameserver-policy"]) ? subDNS["nameserver-policy"] : {});

        // fake-ip-filter 仅在缺省/blacklist 时继承；whitelist/rule 语义不同，继承会反转过滤含义，固定输出 blacklist
        const modeRaw = subDNS["fake-ip-filter-mode"];
        const mode = typeof modeRaw === "string" ? modeRaw.trim().toLowerCase() : "";

        const subFilter = mode === "" || mode === "blacklist"
            ? stringList(subDNS["fake-ip-filter"]).filter(item => !/^(rule-set|geosite|geoip):/i.test(item))
            : [];

        // 逐键清洗：通吃键架空分流、指向重建规则集/内建 geo 的键会硬报错，均丢弃；值同样清洗悬空引用
        for (const key of Object.keys(subPolicy)) {
            if (key === "+." || key === "*" || key === "+" || /^(rule-set|geosite|geoip):/i.test(key)) {
                delete subPolicy[key];
                continue;
            }

            subPolicy[key] = stringList(subPolicy[key]).map(stripDanglingRef);
        }

        // 清洗 proxy-server-nameserver-policy，键：geosite:/geoip: 丢弃；
        // rule-set: 仅当该名字在订阅原始 rule-providers 中有定义时保留并带入最终配置，查不到定义的视为悬空丢弃。
        // 通吃键不删（区别于普通 nameserver-policy）：此字段只作用于节点域名，脚本不在此注入条目
        const rawPSNPolicy = isObj(subDNS["proxy-server-nameserver-policy"]) ? subDNS["proxy-server-nameserver-policy"] : {};
        const subPSNPolicy = {};
        const carriedRuleProviders = {};

        for (const key of Object.keys(rawPSNPolicy)) {
            if (/^(geosite|geoip):/i.test(key)) continue;

            const names = ruleSetNames(key);

            if (names.length > 0) {
                const validNames = names.filter(name => hasOwn(subRuleProviders, name));

                if (validNames.length > 0) {
                    validNames.forEach(name => { carriedRuleProviders[name] = subRuleProviders[name]; });

                    subPSNPolicy["rule-set:" + validNames.join(",")] = stringList(rawPSNPolicy[key]).map(stripDanglingRef);
                }

                continue;
            }

            subPSNPolicy[key] = stringList(rawPSNPolicy[key]).map(stripDanglingRef);
        }

        let proxyServerNameserver;
        let proxyServerNameserverPolicy;

        if (subPSN.length > 0) {
            // 机场显式设置节点 DNS 时独占使用，不混入公共 DNS
            proxyServerNameserver = [...new Set(subPSN.map(stripProxyRefs))];
            proxyServerNameserverPolicy = stripProxyRefsPolicy(subPSNPolicy);
        } else {
            // 节点 policy 视为未设置：收集的旧 rule-set 依赖一并放弃，否则并入的 provider 无人引用、凭空下载
            for (const key of Object.keys(carriedRuleProviders)) delete carriedRuleProviders[key];

            // 未显式设置节点 DNS 时，以普通域名解析策略为迁移来源，避免新补公共 DNS 屏蔽机场专用解析
            if (subDNS.fallback !== undefined || subDNS["fallback-filter"] !== undefined) {
                // fallback 属"路由选出 DNS 出口"的复杂行为，无法在单一列表等价表达；忽略，节点解析直接用国内 DoH（不怕污染）
                proxyServerNameserver = [...CN_DNS_DOH];
                proxyServerNameserverPolicy = undefined;
            } else if (subNS.length > 0 || Object.keys(subPolicy).length > 0) {
                // 按原优先关系迁入节点解析（policy 优先于 nameserver 不变）
                proxyServerNameserver = subNS.length > 0
                    ? [...new Set(subNS.map(stripProxyRefs))]
                    : [...CN_DNS_DOH];
                proxyServerNameserverPolicy = Object.keys(subPolicy).length > 0
                    ? stripProxyRefsPolicy(subPolicy)
                    : undefined;
            } else {
                // 无任何可继承解析信息，用默认公共 DNS
                proxyServerNameserver = [...CN_DNS_DOH];
                proxyServerNameserverPolicy = undefined;
            }
        }

        return {
            subDNS,
            subNS,
            subPolicy,
            subFilter,
            carriedRuleProviders,
            proxyServerNameserver,
            proxyServerNameserverPolicy
        };
    };

    let dnsInfo;

    try {
        const rawDNS = params.dns;

        if (rawDNS !== undefined && rawDNS !== null && !isObj(rawDNS)) {
            throw new Error("dns 字段不是对象");
        }

        dnsInfo = deriveSubDNS(rawDNS);
    } catch (error) {
        warnLog(
            "[Clash_rule.js] 读取订阅 DNS 时出错（" +
            (error && error.message ? error.message : String(error)) +
            "），已放弃订阅 DNS，改用脚本默认配置。"
        );

        dnsInfo = deriveSubDNS(null);
    }

    const {
        subDNS,
        subNS,
        subPolicy,
        subFilter,
        carriedRuleProviders,
        proxyServerNameserver,
        proxyServerNameserverPolicy
    } = dnsInfo;

    // DNS 层 IPv6：订阅显式指定则继承，否则跟随全局 ipv6 开关
    const dnsIPv6 = typeof subDNS.ipv6 === "boolean" ? subDNS.ipv6 : ipv6Enabled;

    params.dns = {
        enable: true,
        // 固定回环 + 非特权端口：订阅常见 0.0.0.0:53，被系统 DNS 占住会导致内核启动失败；
        // 要给局域网设备当 DNS 用时改这一行并自行确认端口与防火墙
        listen: "127.0.0.1:1053",
        ipv6: dnsIPv6,
        "prefer-h3": PREFER_H3,
        "enhanced-mode": "fake-ip",
        "fake-ip-range": "198.18.0.1/16",
        // IPv6 fake-ip 段（仅 DNS 启用 IPv6 时输出）：用官方文档段，勿用 fc00::/7 等内网段（与真实局域网冲突）
        ...(dnsIPv6 ? { "fake-ip-range6": "fdfe:dcba:9876::/64" } : {}),
        "cache-algorithm": "arc",
        "fake-ip-filter-mode": "blacklist", // 显式声明，不依赖内核默认值
        "use-hosts": typeof subDNS["use-hosts"] === "boolean" ? subDNS["use-hosts"] : true,
        "use-system-hosts": typeof subDNS["use-system-hosts"] === "boolean" ? subDNS["use-system-hosts"] : true,
        ...(isObj(subDNS.hosts) ? { hosts: subDNS.hosts } : {}),
        // 前段为 real-ip 刚需：局域网、NTP、连通性探测、游戏平台（对时拿假地址会失败，连带影响 TLS 校验）
        "fake-ip-filter": [
            ...new Set([
                "+.lan",
                "+.local",
                "localhost.ptlogin2.qq.com",
                "+.msftconnecttest.com",
                "+.msftncsi.com",
                "+.ntp.org",
                "+.xboxlive.com",
                "+.playstation.net",
                "+.xbox.com",
                "xbox.ipv6.microsoft.com",
                "+.srv.nintendo.net",
                "time.windows.com",
                "time.apple.com",
                // STUN 通配：域名含 stun 段的全部豁免假地址
                "+.stun.*",
                "+.stun.*.*",
                "+.stun.*.*.*",
                "+.stun.*.*.*.*",
                // 关键项：国内域名返回真实 IP，规则里的 GEOIP,cn 才有 IP 可匹配（分流以 IP 判断优先）。
                // 用 rule-set:cn-domain 而非 geosite:cn：与下面的 RULE-SET,cn-domain 兜底同源，口径一致。
                // 删掉则国内站点全拿到 fake-ip 假地址，GEOIP,cn 永不命中，只能靠后面的域名兜底
                "rule-set:cn-domain",
                "geosite:private",
                "rule-set:fakeip-filter",
                ...subFilter
            ])
        ],
        // 引导 DNS：仅解析其它 DoH 服务器域名；明文 IP 最快且不依赖证书校验（时钟不准时 DoT 证书校验会失败）
        "default-nameserver": [...CN_DNS_PLAIN],
        "proxy-server-nameserver": proxyServerNameserver,
        ...(proxyServerNameserverPolicy && Object.keys(proxyServerNameserverPolicy).length > 0
            ? { "proxy-server-nameserver-policy": proxyServerNameserverPolicy }
            : {}),
        // 订阅指定了 DNS 就独占使用；否则用海外 DoH 兜底。
        // #RULES：按路由规则出站（未匹配项经 MATCH 落漏网之鱼），与组名解耦
        nameserver: subNS.length > 0
            ? [...new Set(subNS)]
            : ["https://1.1.1.1/dns-query#RULES", "https://8.8.8.8/dns-query#RULES"],
        // 「国内站点」组命中后（GEOIP,cn）且未被 nameserver-policy 覆盖的域名用国内 DNS，避免退回代理模式查海外。
        // 用纯 IP：该字段用 DoH 在部分环境会反复回退 default-nameserver 重复解析、拖高延迟
        "direct-nameserver": [...CN_DNS_PLAIN],
        "direct-nameserver-follow-policy": true,
        // subPolicy 放前：不同名键保留，同名键被下面几条覆盖，不丢订阅意图也不让它盖掉脚本分流
        "nameserver-policy": Object.assign({}, subPolicy, {
            "geosite:private": ["system://"],
            "rule-set:ads-domain": ["rcode://name_error"],
            // 与 fake-ip-filter、RULE-SET,cn-domain 同源：国内域名统一走国内 DoH 拿真实 IP
            "rule-set:cn-domain": [...CN_DNS_DOH]
        })
    };

    // 远程规则集：MetaCubeX 官方拆分库，全 mrs。
    // cn 的域名清单重新改为下载（V5.10 起的纯 GEOIP 判断漏网站点太多，需域名兜底）；
    // private 仍用内置 GEOSITE/GEOIP，不建对应 provider
    const RS_BASE = "https://cdn.jsdmirror.com/gh/MetaCubeX/meta-rules-dat@meta/geo";

    const mkProvider = (behavior, dir, name) => ({
        type: "http",
        behavior,
        format: "mrs",
        url: `${RS_BASE}/${dir}/${name}.mrs`,
        path: `./ruleset/${dir}-${name}.mrs`,
        interval: RS_INTERVAL
    });

    const domain = name => mkProvider("domain", "geosite", name);
    const ip = name => mkProvider("ipcidr", "geoip", name);

    // 清空重建；必要的旧依赖由下方 carriedRuleProviders 搬运
    params["rule-providers"] = {
        // 国内域名清单（geosite/cn，520KB）：GEOIP 判不到的国内站点（海外 CDN / 解析到境外 IP / 拿的是 fake-ip）
        // 由它兜底捞回「国内站点」。同时在 DNS 侧替代 geosite:cn 用（fake-ip-filter 与 nameserver-policy），
        // 让「哪些域名该拿真实 IP」与「哪些域名算国内」用同一份数据，避免两侧口径打架
        "cn-domain": domain("cn"),
        "ads-domain": domain("category-ads-all"),
        "telegram-domain": domain("telegram"),
        "telegram-ip": ip("telegram"),
        "github-domain": domain("github"),
        "ai-domain": domain("category-ai-!cn"),
        "apple-domain": domain("apple"),
        "microsoft-domain": domain("microsoft"),
        // 境外域名（geolocation-!cn，194KB，规则集中最大的一块）不再下载：
        // 漏网之鱼默认出口就是代理模式，境外域名落 MATCH 结果一致
        // 社区维护的 fake-ip 豁免清单（wwqgtxx/clash-rules，官方未收录），供 dns.fake-ip-filter 引用
        "fakeip-filter": {
            type: "http",
            behavior: "domain",
            format: "mrs",
            url: "https://cdn.jsdmirror.com/gh/wwqgtxx/clash-rules@release/fakeip-filter.mrs",
            path: "./ruleset/fakeip-filter.mrs",
            interval: RS_INTERVAL
        }
    };

    // 并入确认必要的旧 rule-set 依赖；与自建规则集同名时订阅份改名 sub-<原名>（仍冲突加序号），
    // 并同步改写 policy 键——两处必须一致，否则 policy 指向不存在的规则集。
    // type: file 的 provider 指向订阅方机器上不存在的本地文件，搬运过去内核启动即报错；
    // 这类连同其在 policy 中的 rule-set 引用一并丢弃
    const renamedRS = {};
    const droppedCarriedRS = new Set();

    Object.keys(carriedRuleProviders).forEach(name => {
        const provider = carriedRuleProviders[name];

        if (isObj(provider) && provider.type === "file") {
            droppedCarriedRS.add(name);
            return;
        }

        let finalName = name;

        if (hasOwn(params["rule-providers"], name)) {
            let suffix = 1;
            finalName = "sub-" + name;

            while (hasOwn(params["rule-providers"], finalName) || hasOwn(carriedRuleProviders, finalName)) {
                suffix++;
                finalName = "sub-" + name + "-" + suffix;
            }

            renamedRS[name] = finalName;
        }

        // 搬运的 provider 沿用订阅里的 path，可能与自建 provider 指向同一缓存文件，
        // 按各自 interval 更新时互相覆写；basename 换成 sub-<finalName>，保留原扩展名（format 未必是 mrs）
        const finalProvider = Object.assign({}, provider);

        if (typeof finalProvider.path === "string" && finalProvider.path.length > 0) {
            const segs = finalProvider.path.split("/");
            const base = segs[segs.length - 1];
            const dot = base.lastIndexOf(".");

            segs[segs.length - 1] = "sub-" + finalName + (dot > 0 ? base.slice(dot) : "");
            finalProvider.path = segs.join("/");
        }

        params["rule-providers"][finalName] = finalProvider;
    });

    if (
        (Object.keys(renamedRS).length > 0 || droppedCarriedRS.size > 0) &&
        params.dns["proxy-server-nameserver-policy"]
    ) {
        const oldPolicy = params.dns["proxy-server-nameserver-policy"];
        const newPolicy = {};

        // 只改写 rule-set: 开头的键，其余键原样保留
        Object.keys(oldPolicy).forEach(key => {
            const names = ruleSetNames(key);

            if (names.length === 0) {
                newPolicy[key] = oldPolicy[key];
                return;
            }

            // 被丢弃的 file 类型引用从键里剔除，整条作废
            const keptNames = names.filter(name => !droppedCarriedRS.has(name));
            if (keptNames.length === 0) return;

            newPolicy["rule-set:" + keptNames.map(name => renamedRS[name] || name).join(",")] = oldPolicy[key];
        });

        params.dns["proxy-server-nameserver-policy"] = newPolicy;
    }

    // 仅这三类协议有 client-fingerprint 字段；hysteria2 / tuic 内核未提供该字段
    const FP_OK = ["vless", "vmess", "trojan"];

    params.proxies.forEach(proxy => {
        if (proxy.type !== "direct" && !("ip-version" in proxy)) {
            proxy["ip-version"] = DEFAULT_IP_VERSION; // 不覆盖订阅已有取值
        }

        if (FP_OK.indexOf(proxy.type) !== -1 && !proxy["client-fingerprint"]) {
            const usesTLS = proxy.type === "trojan" || proxy.tls === true || proxy["reality-opts"];

            if (usesTLS) {
                proxy["client-fingerprint"] = "chrome";
            }
        }
    });

    // 上方 JS 逻辑的 provider 版本（节点运行时才出现，只能用 override 表达式），两侧判定条件必须等价。
    // 用 .["client-fingerprint"] 而非 .client-fingerprint：避免 yq/jq 把连字符 '-' 误解析为减法
    const FP_EXPR = '(select(.type == "trojan" or ((.type == "vless" or .type == "vmess") and (.tls == true or has("reality-opts")))) | select(has("client-fingerprint") | not) | .["client-fingerprint"]) = "chrome"';

    // 规范化为表达式数组；类型非法返回 null，调用方原样保留该 provider、不做注入
    const normalizeOverrideExpr = raw => {
        if (raw === undefined || raw === null) return [];
        if (typeof raw === "string") return raw.length > 0 ? [raw] : [];
        if (Array.isArray(raw)) {
            if (raw.some(item => typeof item !== "string")) return null;

            return raw.filter(item => item.length > 0);
        }

        return null;
    };

    Object.values(params["proxy-providers"] || {}).forEach(provider => {
        if (!provider || typeof provider !== "object" || Array.isArray(provider)) return;

        // 组的 url 健康检查只测 proxies 字段成员，provider 节点须靠 provider 自身的 health-check 产出延迟数据，
        // 否则地区 url-test 组拿不到延迟、永远选中第一个节点。enable 强制开启，其余项以订阅为准
        provider["health-check"] = Object.assign(
            {
                enable: true,
                url: TEST_URL_PROXY,
                interval: 300,
                timeout: 5000,
                "expected-status": 204,
                lazy: true
            },
            isObj(provider["health-check"]) ? provider["health-check"] : {},
            { enable: true }
        );

        const override = provider.override;

        if (override !== undefined && override !== null && (typeof override !== "object" || Array.isArray(override))) {
            return;
        }

        const existingExpr = normalizeOverrideExpr((override || {})["override-expr"]);
        if (existingExpr === null) return;

        const mergedOverride = Object.assign({}, override || {});

        if (!("ip-version" in mergedOverride)) {
            mergedOverride["ip-version"] = DEFAULT_IP_VERSION;
        }

        // 保留上游表达式顺序；脚本指纹表达式最多出现一次（订阅每次刷新重跑本段）
        mergedOverride["override-expr"] = existingExpr.includes(FP_EXPR)
            ? existingExpr
            : [...existingExpr, FP_EXPR];
        provider.override = mergedOverride;
    });

    const groups = [];
    const regionGroupNames = activeRegions.map(r => r.name);

    // 顶层出口：代理模式（旧名「主代理」），只列 6 个地区组，无地区组时退化到「直连模式」避免空组
    groups.push({
        name: "代理模式",
        type: "select",
        icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Auto.png",
        proxies: hasActiveRegions ? regionGroupNames : ["直连模式"]
    });

    // 直连模式：可见组，成员仅内建 DIRECT；与内建 DIRECT 区分——这是名为"直连模式"的策略组
    groups.push({
        name: "直连模式",
        type: "select",
        icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Hijacking.png",
        proxies: ["DIRECT"]
    });

    // 国内站点：配合 GEOIP,cn + RULE-SET,cn-domain 使用；列表首项即默认值，故默认「直连模式」，需要时才手动切「代理模式」
    groups.push({
        name: "国内站点",
        type: "select",
        icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Netease_Music.png",
        proxies: ["直连模式", "代理模式"]
    });

    // 应用组：proxies 只给组级切换目标，不再 include-all 塞入订阅节点本身
    apps.forEach(app => {
        groups.push({
            name: app.name,
            type: "select",
            icon: app.icon.startsWith("http")
                ? app.icon
                : `https://cdn.jsdmirror.com/gh/shindgew/WHATSINStash@main/icon/${app.icon}`,
            proxies: REGION_ONLY_APPS.has(app.name) && hasActiveRegions
                ? [...regionGroupNames]
                : ["代理模式", "直连模式"]
        });
    });

    // 广告拦截：配合 ads-domain 规则集；默认 REJECT（列表首项），需要放行时手动切 DIRECT
    groups.push({
        name: "广告拦截",
        type: "select",
        icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Clubhouse_2.png",
        proxies: ["REJECT", "DIRECT"]
    });

    // 漏网之鱼：MATCH 兜底出口，默认「代理模式」，与兜底语义一致
    groups.push({
        name: "漏网之鱼",
        type: "select",
        icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/PBS.png",
        proxies: ["代理模式", "直连模式"]
    });

    // 6 个地区组：可见，刻意放在组的末尾（面板最下方）。
    // 类型为 url-test：组内自动测速择优，用户只需选地区不必选具体节点。filter 传 Go 正则原串，(?i) 合法
    activeRegions.forEach(({ name, regex, icon }) => {
        groups.push({
            name,
            type: "url-test",
            icon,
            "include-all": true,
            "exclude-type": "direct|reject",
            filter: regex,
            "exclude-filter": excludeFilter,
            // provider 订阅下可能一个节点都匹配不上，用 REJECT 兜底而不是留空组
            "empty-fallback": "REJECT",
            url: TEST_URL_PROXY,
            interval: 300,
            tolerance: 30,
            lazy: true,
            timeout: 5000,
            "max-failed-times": 5,
            "expected-status": 204
        });
    });

    // 本地订阅下若全部节点被 excludeFilter 过滤，各策略组将解析为空并回落 REJECT（静默断网），
    // 转换期能确定时留一条日志；provider 订阅节点不可见，此检查覆盖不到，只能看内核日志
    if (!subHasProviders && allProxies.every(proxy => excludeRe.test(proxy.name))) {
        warnLog(
            "[Clash_rule.js] 订阅节点全部被 excludeFilter 过滤，各策略组将为空并回落 REJECT，网络将不可用；请检查 excludeFilter 或节点命名。"
        );
    }

    params["proxy-groups"] = groups;

    // 规则自上而下先命中先决定，顺序即优先级。按命中频率从高到低排，主流流量越早命中越好：
    //   0. 基础设施（必须最先）：私网、系统对时、可选 QUIC 阻断
    //   1. 广告拦截（必须先于国内地区：国内广告域名同时收录在 ads 与 cn 两个分类里，
    //      排在前面才能拦住；放到 cn 之后国内广告就会被当作普通国内站点放行）
    //   2. Google Play 例外（必须早于国内地区）：googleapis.cn 走代理，否则 Play 下载/更新永远「等待中」
    //   3. 国内地区（GEOIP,cn → 国内站点，再由 RULE-SET,cn-domain 按域名兜底）—— 命中量最大，排在最前可跳过下面 7 条。
    //      先按 IP 判（国内域名靠 fake-ip-filter 拿到真实 IP）；IP 判不到的（海外 CDN / 解析到境外 IP /
    //      未拿到真 IP 的域名）再由 cn 域名清单补判一次，避免国内站点掉到 MATCH 走代理
    //   4. 应用分流（电报 / 人工智能 / 开源社区 / 苹果 / 微软）：这些分类基本不含 cn 域名，
    //      放在国内地区之后不影响它们，只作用于境外流量
    //   5. MATCH → 漏网之鱼（默认代理模式）：境外域名与已移除应用组（谷歌/TV/Spotify/X/TikTok 等）都由它兜底
    params.rules = [
        "GEOSITE,private,DIRECT",
        "GEOIP,private,DIRECT,no-resolve",
        // 系统对时优先于业务分流：很多节点丢弃/限制 UDP 123，时间偏差会连带导致全局 TLS 证书校验失败
        "AND,((DST-PORT,123),(NETWORK,udp)),DIRECT",
        ...(BLOCK_QUIC ? ["AND,((DST-PORT,443),(NETWORK,udp)),REJECT"] : []),

        "RULE-SET,ads-domain,广告拦截",

        // Google Play 下载/更新一直「等待中」的修复（必须早于下面的国内分流）：
        // services.googleapis.cn 实测解析到境内 IP（120.253.x.x），GEOIP,cn 与 cn-domain 都会命中。
        // 一旦被判成国内直连，Play 会拿到 Google「国内 CDN」的下载地址，随后用代理去连国内 CDN，
        // 而国内 CDN 封境外出口被拒 → 永远等待中。让它走代理，Play 才会返回国外 CDN 地址，下载链路与代理一致。
        // 覆盖整个 googleapis.cn 后缀：该后缀下都是 Google API，本就该走代理。
        "DOMAIN-SUFFIX,googleapis.cn,代理模式",

        // 国内直连：先按 IP 判断，命中后交给「国内站点」组。
        // 前提：域名必须拿到真实 IP——由 dns.fake-ip-filter 里的 rule-set:cn-domain 保证，
        // 该过滤项不能删，否则国内域名全是 198.18.x.x 假地址，GEOIP 一条都命中不了。
        // no-resolve：不为此反查域名，避免未收录站点在落到 MATCH 前被海外 nameserver 解析引入延迟
        "GEOIP,cn,国内站点,no-resolve",
        // 兜底：前述 IP 判断漏掉的国内站点（解析到境外 IP 的国内站点、未拿到真 IP 的域名），
        // 按域名补判一次。放在应用分流之前，苹果/微软等的国内 CDN 域名仍归「国内站点」
        "RULE-SET,cn-domain,国内站点",

        "RULE-SET,telegram-domain,电报消息",
        "RULE-SET,telegram-ip,电报消息,no-resolve",
        "RULE-SET,ai-domain,人工智能",
        "RULE-SET,github-domain,开源社区",
        "RULE-SET,apple-domain,苹果服务",
        "RULE-SET,microsoft-domain,微软服务",

        "MATCH,漏网之鱼"
    ];

    return params;
}

if (typeof module !== "undefined") {
    module.exports = main;
    module.exports.main = main;
}
