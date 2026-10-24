// Fixed ZCode 3.15.1 Apache-2.0 pure rules; original Date operations use a per-zone binding.
export function bindCalendarDate(Date) {
    function atTime(date, hour, minute) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
    }
    function firstWeekdayOfMonth(year, month, weekday) {
        const first = new Date(year, month, 1);
        return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7));
    }
    /** 自定义重复规则的下一次运行；所有计算都使用本地日历时间。 */
    function computeScheduleRuleNextRunAt(rule, from = Date.now()) {
        const interval = Math.max(1, Math.floor(rule.interval));
        const anchor = new Date(rule.anchorAt);
        if (rule.unit === "minute") {
            const step = interval * 60 * 1000;
            // 分钟间隔从创建/修改时刻开始，不能像 `*/N` cron 一样提前命中下一个墙钟刻度。
            // 始终从固定 anchor 推导还能避免 scheduler 晚派发后逐轮累积漂移。
            const steps = Math.max(1, Math.floor((from - rule.anchorAt) / step) + 1);
            return rule.anchorAt + steps * step;
        }
        if (rule.unit === "hourly") {
            const base = new Date(anchor);
            base.setMinutes(rule.minute, 0, 0);
            const step = interval * 60 * 60 * 1000;
            const steps = Math.max(0, Math.floor((from - base.getTime()) / step) + 1);
            return base.getTime() + steps * step;
        }
        if (rule.unit === "daily") {
            for (let index = 0; index < 36600; index += 1) {
                const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + index * interval);
                const candidate = atTime(date, rule.hour, rule.minute).getTime();
                if (candidate > from)
                    return candidate;
            }
            return null;
        }
        if (rule.unit === "weekly") {
            const anchorWeek = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
            anchorWeek.setDate(anchorWeek.getDate() - ((anchorWeek.getDay() + 6) % 7));
            const weekdays = [...(rule.weekdays?.length ? rule.weekdays : [1])].sort();
            for (let week = 0; week < 5220; week += interval) {
                for (const weekday of weekdays) {
                    const dayOffset = (weekday + 6) % 7;
                    const date = new Date(anchorWeek.getFullYear(), anchorWeek.getMonth(), anchorWeek.getDate() + week * 7 + dayOffset);
                    const candidate = atTime(date, rule.hour, rule.minute).getTime();
                    if (candidate > from)
                        return candidate;
                }
            }
            return null;
        }
        if (rule.unit === "monthly") {
            // 1200 同时是合法月度间隔与搜索边界；旧的严格小于只检查 offset=0，
            // 当前月候选已过后会错误返回 null。包含边界才能计算 100 年后的下一轮。
            for (let offset = 0; offset <= 1200; offset += interval) {
                const month = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1);
                const candidates = rule.monthlyMode === "weekday"
                    ? [firstWeekdayOfMonth(month.getFullYear(), month.getMonth(), rule.weekdays?.[0] ?? 1)]
                    : [...(rule.monthDays?.length ? rule.monthDays : [1])]
                        .sort((left, right) => left - right)
                        .map((day) => new Date(month.getFullYear(), month.getMonth(), day))
                        .filter((date) => date.getMonth() === month.getMonth());
                for (const date of candidates) {
                    const candidate = atTime(date, rule.hour, rule.minute).getTime();
                    if (candidate > from)
                        return candidate;
                }
            }
            return null;
        }
        // yearly：月份优先取 rule.months（1-12 → 0-indexed），缺省回退锚点月份（兼容旧记录）；
        // 日期取 monthDays[0] 或锚点日。溢出守卫：如 2/30、非闰年 2/29 会滚到下个月，跳过该年避免误触发。
        const targetMonth = rule.months?.[0] != null ? (((rule.months[0] - 1) % 12) + 12) % 12 : anchor.getMonth();
        const targetDay = rule.monthDays?.[0] ?? anchor.getDate();
        for (let offset = 0; offset < 400; offset += interval) {
            const date = new Date(anchor.getFullYear() + offset, targetMonth, targetDay);
            if (date.getMonth() !== targetMonth)
                continue;
            const candidate = atTime(date, rule.hour, rule.minute).getTime();
            if (candidate > from)
                return candidate;
        }
        return null;
    }
    /**
     * 解析 cron 五段字段。只支持 5 段标准 cron（minute hour day-of-month month day-of-week）；
     * 返回各段的纯数字解析结果，范围字段（dow/dom/month）按逗号分隔，通配段返回 undefined。
     * 失败回退到 undefined，由调用方决定降级策略。
     */
    function parseCronFields(cronExpr) {
        const parts = cronExpr.trim().split(/\s+/);
        // noUncheckedIndexedAccess 下 parts[i] 类型含 undefined；解构提取前 5 段。标准 5 段 cron 才解析，
        // 段数不足时返回空对象，由调用方回退到 anchorAt 默认值（避免把 "0 9" 当成有效 cron）。
        const [minuteToken, hourToken, domToken, monthToken, dowToken] = parts;
        if (parts.length < 5 || minuteToken === undefined)
            return {};
        const parseSingle = (token) => {
            if (token === "*" || token === "?")
                return undefined;
            const value = Number(token);
            return Number.isInteger(value) ? value : undefined;
        };
        // 范围字段支持逗号列表（如 "1,3,5"）；忽略非数字 token（如 "*/2"、"1#1"），
        // 这些步长/序号表达式已超出 carrier 场景（步长超限才走 carrier），直接降级到默认值。
        const parseList = (token) => {
            if (token === "*" || token === "?")
                return undefined;
            const values = token
                .split(",")
                .map((piece) => Number(piece))
                .filter((value) => Number.isInteger(value));
            return values.length > 0 ? values : undefined;
        };
        return {
            minute: parseSingle(minuteToken),
            hour: hourToken === undefined ? undefined : parseSingle(hourToken),
            monthDays: domToken === undefined ? undefined : parseList(domToken),
            months: monthToken === undefined ? undefined : parseList(monthToken),
            weekdays: dowToken === undefined ? undefined : parseList(dowToken),
        };
    }
    /**
     * 会话侧自定义重复 carrier（intervalUnit + interval）归一化为权威 scheduleRule。
     *
     * cron 各字段有步长上限（minute 59、hour 24、day-of-month 31、month 12），
     * 「每50小时」「每40天」「每13个月」无法用五段 cron 直接表达。会话侧所有“每 N 单位”均用受控 carrier
     * intervalUnit+interval 携带真实间隔，cronExpr 仅作合法兼容展示；本函数把兼容 cron 各字段
     * 解析成 scheduleRule 所需的 hour/minute/weekdays/monthDays/months，真实 interval 由 carrier
     * 传入。anchorAt 由调用方（service）传入真实创建/修改时刻，调度引擎据此推进。
     *
     * 兼容 cron 字段缺失（如 '* * * * *' 占位）时回退到安全默认值（weekday=[1]、monthDays=[1]、
     * months=锚点月份），保证调度引擎仍可计算下一轮，不静默返回 null。
     */
    function buildIntervalScheduleRule(intervalUnit, interval, cronExpr, anchorAt) {
        const fields = parseCronFields(cronExpr);
        const anchor = new Date(anchorAt);
        const minute = fields.minute ?? anchor.getMinutes();
        const hour = fields.hour ?? anchor.getHours();
        const monthDays = fields.monthDays ?? [anchor.getDate()];
        // cron 的 month/dow 是 1-based/0-based 混用，统一归一到 scheduleRule 语义（见引擎实现）。
        const months = fields.months ?? [anchor.getMonth() + 1];
        const weekdays = fields.weekdays ?? [1];
        switch (intervalUnit) {
            case "minute":
                // 分钟间隔调度完全以 anchorAt 推进，hour/minute 仅作展示；保留锚点时分以便卡片展示。
                return {
                    unit: "minute",
                    interval,
                    hour: anchor.getHours(),
                    minute: anchor.getMinutes(),
                    anchorAt,
                };
            case "hourly":
                // 引擎 hourly 分支只用 rule.minute 对齐分钟；hour 不参与计算（见 computeScheduleRuleNextRunAt）。
                return { unit: "hourly", interval, hour: 0, minute, anchorAt };
            case "daily":
                return { unit: "daily", interval, hour, minute, anchorAt };
            case "weekly":
                return { unit: "weekly", interval, hour, minute, weekdays, anchorAt };
            case "monthly":
                return {
                    unit: "monthly",
                    interval,
                    hour,
                    minute,
                    monthDays,
                    monthlyMode: "date",
                    anchorAt,
                };
            case "yearly":
                return { unit: "yearly", interval, hour, minute, months, monthDays, anchorAt };
            default: {
                // 无效 unit 必须在归一化层拒绝，避免静默生成错误规则后写入数据库。
                const exhaustive = intervalUnit;
                throw new Error(`Unsupported intervalUnit: ${String(exhaustive)}`);
            }
        }
    }
    /** 用于判断直接提交的 scheduleRule 是否仅更新展示字段，比较时忽略 anchorAt。 */
    function scheduleRuleDefinition(rule) {
        return JSON.stringify([
            rule.unit,
            rule.interval,
            rule.hour,
            rule.minute,
            rule.weekdays ? [...rule.weekdays].sort((a, b) => a - b) : null,
            rule.monthDays ? [...rule.monthDays].sort((a, b) => a - b) : null,
            rule.months ? [...rule.months].sort((a, b) => a - b) : null,
            rule.monthlyMode ?? null,
        ]);
    }
    return { buildIntervalScheduleRule, computeScheduleRuleNextRunAt };
}
