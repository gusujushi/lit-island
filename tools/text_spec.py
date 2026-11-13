"""原文定位表：程序内嵌的每一段古籍原文从哪里、按什么规则取。

kind 说明（具体实现见 extract_texts.py）：
  bracket  诗经/花间集/南唐二主词 一类以【标题】起头的文件；meta 匹配标题行余下部分，has 匹配正文
  chtxt    唐诗三百首/宋词三百首（chtxt 精校本）以「○ 标题 / 作者」起头；title 前缀匹配
  ss       世说新语：篇名 + 正文包含的字串
  lines    按行号取整段；expect 必须出现在首行，防止原文件变动后取错
  span     在文件里从 start 字串取到 end 字串（含两端）；after 为起搜行号
  wiki     维基文库 wikitext：先清理标记，再按 section（标题）和/或 start/end 截取
所有文件路径：本机书目在 BOOKS（~/Documents/书籍/文学/古籍下载），维基文库在 sources/wikisource。
"""

TEXTS = [
    # ── 诗经 ──────────────────────────────────────────
    dict(id="sj_guanju", t="关雎", a="《诗经·周南》", kind="bracket", file="诗经.txt", title="关雎"),
    dict(id="sj_jianjia", t="蒹葭", a="《诗经·秦风》", kind="bracket", file="诗经.txt", title="蒹葭"),
    dict(id="sj_meng", t="氓", a="《诗经·卫风》", kind="bracket", file="诗经.txt", title="氓"),
    dict(id="sj_shuoshu", t="硕鼠", a="《诗经·魏风》", kind="bracket", file="诗经.txt", title="硕鼠"),
    dict(id="sj_fatan", t="伐檀", a="《诗经·魏风》", kind="bracket", file="诗经.txt", title="伐檀"),
    dict(id="sj_qiyue", t="七月", a="《诗经·豳风》", kind="bracket", file="诗经.txt", title="七月"),
    dict(id="sj_shuli", t="黍离", a="《诗经·王风》", kind="bracket", file="诗经.txt", title="黍离"),
    dict(id="sj_caiwei", t="采薇", a="《诗经·小雅》", kind="bracket", file="诗经.txt", title="采薇"),
    dict(id="sj_wuyi", t="无衣", a="《诗经·秦风》", kind="bracket", file="诗经.txt", title="无衣", meta="秦风"),
    dict(id="sj_luming", t="鹿鸣", a="《诗经·小雅》", kind="bracket", file="诗经.txt", title="鹿鸣"),
    dict(id="sj_qingmiao", t="清庙", a="《诗经·周颂》", kind="bracket", file="诗经.txt", title="清庙"),

    # ── 魏晋南北朝 ────────────────────────────────────
    dict(id="wj_baima", t="白马篇", a="曹植", kind="wiki", file="白馬篇_(曹植).wiki"),
    dict(id="wj_yonghuai", t="咏怀·其一", a="阮籍", kind="wiki", file="詠懷詩五言八十二首.wiki", start="夜中不能寐", end="憂思獨傷心。"),
    dict(id="ss_ruanji", t="阮籍遭母丧", a="《世说新语·任诞》", kind="ss", pian="任誕第二十三", has="阮籍遭母喪"),
    dict(id="wj_guiyuan", t="归园田居·其一", a="陶渊明", kind="wiki", file="歸園田居.wiki", section="其一"),
    dict(id="wj_yinjiu", t="饮酒·其五", a="陶渊明", kind="wiki", file="飲酒二十首.wiki", section="其五"),
    dict(id="wj_taohua", t="桃花源记", a="陶渊明", kind="wiki", file="桃花源記.wiki", start="晉太元中", end="後遂無問津者。"),
    dict(id="ss_guanning", t="管宁割席", a="《世说新语·德行》", kind="ss", pian="德行第一", has="管寧、華歆共園中鋤菜"),
    dict(id="ss_xinting", t="新亭对泣", a="《世说新语·言语》", kind="ss", pian="言語第二", has="每至美日，輒相邀新亭"),
    dict(id="ss_jincheng", t="木犹如此", a="《世说新语·言语》", kind="ss", pian="言語第二", has="桓公北征經金城"),
    dict(id="ss_xiean", t="谢安围棋", a="《世说新语·雅量》", kind="ss", pian="雅量第六", has="謝公與人圍棊"),
    dict(id="ss_ziyou", t="雪夜访戴", a="《世说新语·任诞》", kind="ss", pian="任誕第二十三", has="王子猷居山陰"),
    dict(id="sx_ganjiang", t="三王墓（干将莫邪）", a="《搜神记》卷十一", kind="wiki", file="搜神記__第11卷.wiki", start="楚干將莫邪為楚王作劍", end="故通名三王墓。今在汝南北宜春縣界。"),
    dict(id="sx_songding", t="宋定伯卖鬼", a="《搜神记》卷十六", kind="wiki", file="搜神記__第16卷.wiki", start="南陽宋定伯", end="得錢千五。」"),

    # ── 十六国诸燕（《晋书·载记》本机文本，按行号取并核首行字串） ──
    dict(id="jin_hui", t="慕容廆：教以农桑，立郡以统流人", a="《晋书·慕容廆载记》", kind="lines", file="晋书.txt", a_line=16553, b_line=16561, expect="太康十年", pick=[16553, 16555, 16561]),
    dict(id="jin_ice", t="慕容皝：践凌而进", a="《晋书·慕容皝载记》", kind="lines", file="晋书.txt", a_line=16619, b_line=16619, expect="皝將乘海討仁"),
    dict(id="jin_jicheng", t="棘城之围", a="《晋书·慕容皝载记》", kind="lines", file="晋书.txt", a_line=16631, b_line=16631, expect="皝以段遼屢為邊患"),
    dict(id="jin_ranmin", t="慕容恪擒冉闵", a="《晋书·慕容儁载记》", kind="lines", file="晋书.txt", a_line=16737, b_line=16739, expect="時鮮卑段勤初附於儁", pick=[16737, 16739]),
    dict(id="jin_ke", t="慕容恪：辅政与遗言", a="《晋书·慕容儁载记》《慕容暐载记》", kind="lines", file="晋书.txt", a_line=16803, b_line=16893, expect="俄而儁寢疾", pick=[16803, 16851, 16893]),
    dict(id="jin_fangtou", t="枋头之战与慕容垂出奔", a="《晋书·慕容暐载记》", kind="lines", file="晋书.txt", a_line=16859, b_line=16861, expect="晉大司馬桓溫"),
    dict(id="tj_peidao", t="王猛的佩刀之计", a="《资治通鉴》卷一百二", kind="wiki", file="資治通鑑__卷102.wiki", start="王猛之發長安也", end="為追騎所獲。"),
    dict(id="tj_feishui", t="淝水之战与慕容垂", a="《资治通鉴》卷一百五", kind="wiki", file="資治通鑑__卷105.wiki", start="秦兵逼肥水而陳", end="秦兵遂潰。", also=dict(start="是時，諸軍皆潰", end="悉以兵授堅。")),
    dict(id="jin_chui", t="慕容垂的选择（晋书本）", a="《晋书·慕容垂载记》", kind="lines", file="晋书.txt", a_line=17989, b_line=17991, expect="堅之敗於淮南也"),
    dict(id="tj_canhe", t="参合陂", a="《资治通鉴》卷一百八", kind="wiki", file="資治通鑑__卷108.wiki", start="燕軍至參合陂", end="太子寶等皆單騎僅免。", also=dict(start="垂之過參合陂也", end="乃引還阻山。")),
    dict(id="jin_de", t="慕容德南迁", a="《晋书·慕容德载记》", kind="lines", file="晋书.txt", a_line=18419, b_line=18419, expect="初，寶之至黎陽也"),
    dict(id="tj_guanggu", t="广固城破", a="《资治通鉴》卷一百一十五", kind="wiki", file="資治通鑑__卷115.wiki", start="劉裕過大峴", end="虜已入吾掌中矣。", also=dict(start="丁亥，劉裕悉眾攻城", end="惟以母托劉敬宣而已。")),
    dict(id="jin_xi", t="慕容熙的龙腾苑", a="《晋书·慕容熙载记》", kind="lines", file="晋书.txt", a_line=18117, b_line=18117, expect="大築龍騰苑"),
    dict(id="jin_fengba", t="冯跋葬高云", a="《晋书·冯跋载记》", kind="lines", file="晋书.txt", a_line=18243, b_line=18247, expect="初，跋弟素弗", pick=[18243, 18247]),

    # ── 唐诗 ──────────────────────────────────────────
    dict(id="ts_shanju", t="山居秋暝", a="王维", kind="chtxt", file="唐诗三百首.txt", title="山居秋暝", author="王維"),
    dict(id="ts_luzhai", t="鹿柴", a="王维", kind="chtxt", file="唐诗三百首.txt", title="鹿柴", author="王維"),
    dict(id="ts_zhuli", t="竹里馆", a="王维", kind="chtxt", file="唐诗三百首.txt", title="竹里館", author="王維"),
    dict(id="ts_weicheng", t="渭城曲", a="王维", kind="chtxt", file="唐诗三百首.txt", title="渭城曲", author="王維"),
    dict(id="ts_qiangjin", t="将进酒", a="李白", kind="chtxt", file="唐诗三百首.txt", title="將進酒", author="李白"),
    dict(id="ts_tianmu", t="梦游天姥吟留别", a="李白", kind="chtxt", file="唐诗三百首.txt", title="夢遊天姥吟留別", author="李白"),
    dict(id="ts_duzhuo", t="月下独酌", a="李白", kind="chtxt", file="唐诗三百首.txt", title="月下獨酌", author="李白"),
    dict(id="ts_chunwang", t="春望", a="杜甫", kind="chtxt", file="唐诗三百首.txt", title="春望", author="杜甫"),
    dict(id="ts_yueye", t="月夜", a="杜甫", kind="chtxt", file="唐诗三百首.txt", title="月夜", author="杜甫"),
    dict(id="ts_bingche", t="兵车行", a="杜甫", kind="chtxt", file="唐诗三百首.txt", title="兵車行", author="杜甫"),
    dict(id="ts_denggao", t="登高", a="杜甫", kind="chtxt", file="唐诗三百首.txt", title="登高", author="杜甫"),
    dict(id="ts_shuxiang", t="蜀相", a="杜甫", kind="chtxt", file="唐诗三百首.txt", title="蜀相", author="杜甫"),
    dict(id="ts_pipa", t="琵琶行", a="白居易", kind="chtxt", file="唐诗三百首.txt", title="琵琶行", author="白居易"),
    dict(id="ts_changhen", t="长恨歌", a="白居易", kind="chtxt", file="唐诗三百首.txt", title="長恨歌", author="白居易"),
    dict(id="ts_jinse", t="锦瑟", a="李商隐", kind="chtxt", file="唐诗三百首.txt", title="錦瑟", author="李商隱"),
    dict(id="ts_yeyu", t="夜雨寄北", a="李商隐", kind="chtxt", file="唐诗三百首.txt", title="夜雨寄北", author="李商隱"),
    dict(id="ts_wuti", t="无题（相见时难别亦难）", a="李商隐", kind="chtxt", file="唐诗三百首.txt", title="無題", author="李商隱", has="相見時難"),

    # ── 五代十国 ──────────────────────────────────────
    dict(id="hj_wen", t="菩萨蛮（小山重叠金明灭）", a="温庭筠", kind="bracket", file="花间集.txt", title="菩萨蛮", meta="其一 · 温庭筠"),
    dict(id="hj_wei", t="菩萨蛮（人人尽说江南好）", a="韦庄", kind="bracket", file="花间集.txt", title="菩萨蛮", meta="人人尽说江南好"),
    dict(id="nt_jing", t="摊破浣溪沙（菡萏香销翠叶残）", a="李璟", kind="bracket", file="南唐二主词.txt", title="摊破浣溪沙·菡萏香销翠叶残"),
    dict(id="nt_yulou", t="玉楼春（晚妆初了明肌雪）", a="李煜", kind="bracket", file="南唐二主词.txt", title="玉楼春·晚妆初了明肌雪"),
    dict(id="nt_yumei", t="虞美人（春花秋月何时了）", a="李煜", kind="bracket", file="南唐二主词.txt", title="虞美人·春花秋月何时了"),
    dict(id="nt_xiangjian", t="相见欢（无言独上西楼）", a="李煜", kind="bracket", file="南唐二主词.txt", title="相见欢·无言独上西楼"),
    dict(id="nt_langtao", t="浪淘沙令（帘外雨潺潺）", a="李煜", kind="bracket", file="南唐二主词.txt", title="浪淘沙令·帘外雨潺潺"),
    dict(id="nt_pozhen", t="破阵子（四十年来家国）", a="李煜", kind="bracket", file="南唐二主词.txt", title="破阵子·四十年来家国"),

    # ── 宋词 ──────────────────────────────────────────
    dict(id="sc_yanshu", t="浣溪沙（一曲新词酒一杯）", a="晏殊", kind="chtxt", file="宋词三百首.txt", title="浣溪沙", author="晏殊", has="一曲新詞"),
    dict(id="sc_ouyang", t="蝶恋花（庭院深深深几许）", a="欧阳修", kind="chtxt", file="宋词三百首.txt", title="蝶戀花", author="歐陽修", has="庭院深深"),
    dict(id="sc_yulin", t="雨霖铃", a="柳永", kind="chtxt", file="宋词三百首.txt", title="雨霖鈴", author="柳永"),
    dict(id="sc_jiangcheng", t="江城子·乙卯正月二十日夜记梦", a="苏轼", kind="chtxt", file="宋词三百首.txt", title="江城子", author="蘇軾"),
    dict(id="sc_dingfeng", t="定风波（莫听穿林打叶声）", a="苏轼", kind="chtxt", file="宋词三百首.txt", title="定風波", author="蘇軾"),
    dict(id="sc_niannu", t="念奴娇·赤壁怀古", a="苏轼", kind="chtxt", file="宋词三百首.txt", title="念奴嬌·赤壁懷古", author="蘇軾"),
    dict(id="sc_shuidiao", t="水调歌头（明月几时有）", a="苏轼", kind="chtxt", file="宋词三百首.txt", title="水調歌頭", author="蘇軾"),
    dict(id="sc_rumeng", t="如梦令（昨夜雨疏风骤）", a="李清照", kind="chtxt", file="宋词三百首.txt", title="如夢令", author="李清照"),
    dict(id="sc_zuihua", t="醉花阴", a="李清照", kind="chtxt", file="宋词三百首.txt", title="醉花陰", author="李清照"),
    dict(id="sc_shengsheng", t="声声慢", a="李清照", kind="chtxt", file="宋词三百首.txt", title="聲聲慢", author="李清照"),
    dict(id="sc_yongyu", t="永遇乐（落日熔金）", a="李清照", kind="chtxt", file="宋词三百首.txt", title="永遇樂", author="李清照"),
    dict(id="sc_pozhen", t="破阵子·为陈同甫赋壮语以寄", a="辛弃疾", kind="chtxt", file="宋词三百首.txt", title="破陣子", author="辛棄疾"),
    dict(id="sc_qingyu", t="青玉案·元夕", a="辛弃疾", kind="chtxt", file="宋词三百首.txt", title="青玉案·元夕", author="辛棄疾"),
    dict(id="sc_jingkou", t="永遇乐·京口北固亭怀古", a="辛弃疾", kind="chtxt", file="宋词三百首.txt", title="永遇樂·京口北固亭懷古", author="辛棄疾"),
    dict(id="sc_yangzhou", t="扬州慢", a="姜夔", kind="chtxt", file="宋词三百首.txt", title="揚州慢", author="姜夔"),
    dict(id="sc_manjiang", t="满江红", a="岳飞（著作权有争议）", kind="chtxt", file="宋词三百首.txt", title="滿江紅", author="岳飛"),

    # ── 元曲 ──────────────────────────────────────────
    dict(id="yq_qiusi", t="天净沙·秋思", a="马致远", kind="span", file="元曲.txt", after=46150, start="枯藤老树昏鸦", end="断肠人在天涯。"),
    dict(id="yq_tongguan", t="山坡羊·潼关怀古", a="张养浩", kind="span", file="元曲.txt", after=47090, start="峰峦如聚", end="亡，百姓苦！"),
    dict(id="yq_bufulao", t="南吕·一枝花·不伏老", a="关汉卿", kind="wiki", file="一枝花·不伏老.wiki", start="攀出牆朵朵花", end="那其間才不向煙花路兒上走！"),
    dict(id="zj_dou3", t="窦娥冤·第三折（选）", a="关汉卿", kind="wiki", file="竇娥冤.wiki", section="第三折", start="【正宮•端正好】", end="哎，只落得兩淚漣漣。"),
    dict(id="zj_dou3b", t="窦娥冤·第三折·三桩誓愿", a="关汉卿", kind="wiki", file="竇娥冤.wiki", section="第三折", start="【二煞】", end="亢旱三年呵，"),
    dict(id="zj_dou4", t="窦娥冤·第四折（选）", a="关汉卿", kind="wiki", file="竇娥冤.wiki", section="第四折", start="我且問你：這楚州三年不雨", end=None, maxlen=900),
    dict(id="zj_xixiang", t="西厢记·长亭送别（选）", a="王实甫", kind="wiki", file="西廂記__第4本.wiki", section="第三折", start="【正宮】【端正好】碧雲天", end=None, maxlen=1100),
    dict(id="zj_hangong", t="汉宫秋·第三折（选）", a="马致远", kind="wiki", file="破幽夢孤雁漢宮秋.wiki", section="第三折", start="【梅花酒】", end="高燒銀燭照紅妝。"),
    dict(id="zj_zhaoshi", t="赵氏孤儿·第二折（选）", a="纪君祥", kind="wiki", file="趙氏孤兒.wiki", section="第二折", start="老宰輔不知，那屠岸賈為走了趙氏孤兒", end="老夫一死，何足道哉。"),

    # ── 明清 ──────────────────────────────────────────
    dict(id="mq_huxin", t="湖心亭看雪", a="张岱《陶庵梦忆》", kind="wiki", file="湖心亭看雪.wiki", start="崇禎五年十二月", end="更有癡似相公者。」"),
    dict(id="hl_haole", t="好了歌与好了歌注", a="《红楼梦》第一回", kind="span", file="红楼梦.txt", after=60, start="世人都晓神仙好，惟有功名忘不了", end="为他人作嫁衣裳"),
    dict(id="hl_fengjie", t="王熙凤出场", a="《红楼梦》第三回", kind="span", file="红楼梦.txt", after=150, start="一语未了，只听后院中有人笑声", end=None, maxlen=1300),
    dict(id="hl_hufu", t="护官符", a="《红楼梦》第四回", kind="span", file="红楼梦.txt", after=200, start="贾不假，白玉为堂金作马", end=None, maxlen=650),
    dict(id="hl_panci", t="金陵十二钗判词（选）", a="《红楼梦》第五回", kind="span", file="红楼梦.txt", after=300, pieces=[("可叹停机德", "金簪雪里埋．"), ("才自精明志自高", "千里东风一梦遥．"), ("凡鸟偏从末世来", "哭向金陵事更哀．")]),
    dict(id="hl_aida", t="宝玉挨打", a="《红楼梦》第三十三回", kind="span", file="红楼梦.txt", after=1860, start="宝玉急的跺脚，正没抓寻处", end=None, maxlen=1400),
    dict(id="rl_fanjin", t="范进中举", a="《儒林外史》第三回", kind="span", file="古籍下载2/儒林外史.txt", start="范進不看便罷", end=None, maxlen=1900),
    dict(id="rl_yan", t="严监生的两个指头", a="《儒林外史》第五、六回", kind="span", file="古籍下载2/儒林外史.txt", sep="\n……\n", pieces=[("自此，嚴監生的病", "且聽下回分解。"), ("話說嚴監生臨死之時", "登時就沒了氣。")]),
    dict(id="lz_cuzhi", t="促织", a="蒲松龄《聊斋志异》", kind="bracket", file="古籍下载2/聊斋志异.txt", title="促織"),
    dict(id="lz_huapi", t="画皮", a="蒲松龄《聊斋志异》", kind="bracket", file="古籍下载2/聊斋志异.txt", title="畫皮"),

    # ── 公案 ──────────────────────────────────────────
    dict(id="sx_huan", t="狸猫换太子", a="《三侠五义》第一回", kind="span", file="三侠五义.txt", after=40, start="你道此盒內是什麼東西", end=None, maxlen=900),
    dict(id="sx_wupen", t="乌盆诉苦", a="《三侠五义》第五回", kind="lines", file="三侠五义.txt", a_line=170, b_line=175, expect="這東塔窪離小沙窩"),
    dict(id="sx_yumao", t="耀武楼封御猫", a="《三侠五义》第二十二回", kind="span", file="三侠五义.txt", after=500, start="單說展爺到了閣下", end=None, maxlen=1300),
    dict(id="sx_yan", t="颜查散一案", a="《三侠五义》第三十八—三十九回", kind="lines", file="三侠五义.txt", a_line=842, b_line=854, expect="包公聽畢", pick=[842, 849, 851, 852, 854]),
    dict(id="sg_1", t="施公案·第一回（选）", a="《施公案》", kind="span", file="古籍下载2/施公案.txt", unwrap=True, start="話說江都縣有一秀才", end="待小的們好去拿人。」"),
    dict(id="sg_2", t="施公案·第二回（选）", a="《施公案》", kind="span", file="古籍下载2/施公案.txt", unwrap=True, start="且說公然見天色將晚", end=None, maxlen=1300),
    # ── 第二批本机补充（古籍下载2，2026-11-12） ──
    dict(id="cxl_zhixing", t="知行合一", a="王阳明《传习录》上·徐爱录", kind="lines", file="古籍下载2/传习录.txt", a_line=27, b_line=27, expect="爱因未会先生知行合一之训", punct=True),
    dict(id="cxl_nanzhen", t="南镇观花", a="王阳明《传习录》下", kind="lines", file="古籍下载2/传习录.txt", a_line=645, b_line=645, expect="先生游南镇", punct=True),
    dict(id="mdt_tici", t="牡丹亭题词", a="汤显祖", kind="span", file="古籍下载2/牡丹亭.txt", unwrap=True, start="天下女子有情", end="萬曆戊戍秋清遠道人題"),
    dict(id="mdt_jingmeng", t="牡丹亭·惊梦（选）", a="汤显祖", kind="span", file="古籍下载2/牡丹亭.txt", unwrap=True, start="〔上白＋下十羅袍〕", end="淹煎，潑殘生，除問天！", fix=[("〔上白＋下十羅袍〕", "〔皂羅袍〕", "源文件以组字式表示缺字，还原为曲牌名")]),
    dict(id="pg_1", t="彭公案·第一回（选）", a="《彭公案》", kind="span", file="古籍下载2/彭公案.txt", unwrap=True, start="今年五月初五日", end="帶回莊中發落！", fix=[("氵裡江寺", "裡江寺", "源文件拆字错码，据本回回目改")]),
    # ── 第三批本机补充（古籍下载3，2026-11-12）：王国维《人间词话》、鲁迅《中国小说史略》（古登堡公版） ──
    dict(id="rj_1", t="人间词话·一（境界）", a="王国维《人间词话》", kind="span", file="古籍下载3/人间词话_王国维_Gutenberg_v001.txt", unwrap=True, start="詞以境界為最上", end="五代北宋之詞所以獨絕者在此。", sub=[(r"（[０-９]+）", "", "删去注本的注码"), (r"〔([^〔〕]*)〕", r"「\1」", "注本以〔〕作引号，改为「」")]),
    dict(id="rj_3", t="人间词话·三（有我之境、无我之境）", a="王国维《人间词话》", kind="span", file="古籍下载3/人间词话_王国维_Gutenberg_v001.txt", unwrap=True, start="有有我之境，有無我之境。", end="此在豪傑之士能自樹立耳。", sub=[(r"（[０-９]+）", "", "删去注本的注码"), (r"〔([^〔〕]*)〕", r"「\1」", "注本以〔〕作引号，改为「」")]),
    dict(id="rj_12", t="人间词话·十二（温韦词品）", a="王国维《人间词话》", kind="span", file="古籍下载3/人间词话_王国维_Gutenberg_v001.txt", unwrap=True, start="〔畫屏金鷓鴣〕", end="殆近之歟？", sub=[(r"（[０-９]+）", "", "删去注本的注码"), (r"〔([^〔〕]*)〕", r"「\1」", "注本以〔〕作引号，改为「」")]),
    dict(id="rj_13", t="人间词话·十三（南唐中主）", a="王国维《人间词话》", kind="span", file="古籍下载3/人间词话_王国维_Gutenberg_v001.txt", unwrap=True, start="南唐中主詞：", end="故知解人正不易得。", sub=[(r"（[０-９]+）", "", "删去注本的注码"), (r"〔([^〔〕]*)〕", r"「\1」", "注本以〔〕作引号，改为「」")]),
    dict(id="rj_15", t="人间词话·十五（词至李后主而眼界始大）", a="王国维《人间词话》", kind="span", file="古籍下载3/人间词话_王国维_Gutenberg_v001.txt", unwrap=True, start="詞至李後主而眼界始大", end="能有此氣象耶？", sub=[(r"（[０-９]+）", "", "删去注本的注码"), (r"〔([^〔〕]*)〕", r"「\1」", "注本以〔〕作引号，改为「」")]),
    dict(id="rj_18", t="人间词话·十八（以血书者）", a="王国维《人间词话》", kind="span", file="古籍下载3/人间词话_王国维_Gutenberg_v001.txt", unwrap=True, start="尼采謂：", end="其大小固不同矣。", sub=[(r"（[０-９]+）", "", "删去注本的注码"), (r"〔([^〔〕]*)〕", r"「\1」", "注本以〔〕作引号，改为「」")]),
    dict(id="rj_26", t="人间词话·二六（三种境界）", a="王国维《人间词话》", kind="span", file="古籍下载3/人间词话_王国维_Gutenberg_v001.txt", unwrap=True, start="古今之成大事業", end="恐為晏歐諸公所不許也。", sub=[(r"（[０-９]+）", "", "删去注本的注码"), (r"〔([^〔〕]*)〕", r"「\1」", "注本以〔〕作引号，改为「」")]),
    dict(id="lx_soushen", t="论干宝《搜神记》", a="鲁迅《中国小说史略》第五篇", kind="span", file="古籍下载3/中国小说史略_鲁迅_Gutenberg_v001.txt", unwrap=True, start="新蔡干寶字令升", end="又偶有釋氏說。", sub=[(r"〔\d+〕", "", "删去注码")]),
    dict(id="lx_shishuo", t="论《世说新语》", a="鲁迅《中国小说史略》第七篇", kind="span", file="古籍下载3/中国小说史略_鲁迅_Gutenberg_v001.txt", unwrap=True, start="《世說新語》今本凡三十八篇", end="故世人尤珍重之。", sub=[(r"〔\d+〕", "", "删去注码")]),
    dict(id="lx_liaozhai", t="论《聊斋志异》", a="鲁迅《中国小说史略》第二十二篇", kind="span", file="古籍下载3/中国小说史略_鲁迅_Gutenberg_v001.txt", unwrap=True, start="《聊齋志异》雖亦如當時同類之書", end="故讀者耳目，為之一新。", sub=[(r"〔\d+〕", "", "删去注码")]),
    dict(id="lx_rulin", t="论《儒林外史》", a="鲁迅《中国小说史略》第二十三篇", kind="span", file="古籍下载3/中国小说史略_鲁迅_Gutenberg_v001.txt", unwrap=True, start="迨吳敬梓《儒林外史》出", end="于是說部中乃始有足稱諷刺之書。", sub=[(r"〔\d+〕", "", "删去注码")]),
    dict(id="lx_xiayi", t="论侠义小说", a="鲁迅《中国小说史略》第二十七篇", kind="span", file="古籍下载3/中国小说史略_鲁迅_Gutenberg_v001.txt", unwrap=True, start="《三俠五義》為市井細民寫心", end="樂為臣仆之時不辦也。", sub=[(r"〔\d+〕", "", "删去注码")]),
    dict(id="lx_honglou", t="论《红楼梦》的价值", a="鲁迅《中国小说的历史的变迁》（附于《中国小说史略》本）", kind="span", file="古籍下载3/中国小说史略_鲁迅_Gutenberg_v001.txt", unwrap=True, start="至于說到《紅樓夢》的价值", end="倒是還在其次的事。", sub=[(r"〔\d+〕", "", "删去注码")]),
]
