/**
 * 测试知识抽取服务
 *
 * 使用方法：
 * 1. 确保 GEMINI_API_KEY 环境变量已设置
 * 2. 运行: node test-extraction.js
 */

async function testExtraction() {
  console.log('=== LLM 知识抽取服务测试 ===\n');

  // 测试文本
  const testText = `
    苹果公司于 2024 年 6 月 11 日在 WWDC 开发者大会上发布了 Apple Intelligence，
    这是一套全新的 AI 功能集成到 iPhone、Mac 和 iPad 中。Apple Intelligence 结合了
    设备端处理和云端处理，使用私有云计算来保护用户隐私。

    与此同时，OpenAI 宣布与苹果建立合作伙伴关系，将 ChatGPT 集成到 iOS 和 macOS 系统中。
    这一合作预计将增强 Siri 的智能对话能力。

    业内分析师预测，这一举措可能会在 2024 年底前改变智能手机 AI 助手的竞争格局。
    Google 的 Gemini 和三星的 Galaxy AI 可能面临更大的竞争压力。
  `;

  console.log('测试文本:');
  console.log(testText);
  console.log('\n' + '='.repeat(60) + '\n');

  try {
    const response = await fetch('http://localhost:3000/api/extraction/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: testText,
        options: {
          includeEntities: true,
          includeRelations: true,
          includeClaims: true,
          includeEvents: true
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    console.log('=== 抽取结果 ===\n');

    // 实体
    console.log(`📦 实体 (${result.entities?.length || 0} 个):`);
    (result.entities || []).forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.text} (${e.type}) - 置信度: ${(e.confidence * 100).toFixed(0)}%`);
      if (e.metadata?.description) {
        console.log(`     描述: ${e.metadata.description}`);
      }
    });

    // 关系
    console.log(`\n🔗 关系 (${result.relations?.length || 0} 个):`);
    (result.relations || []).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.source} --[${r.relation}]--> ${r.target} - 置信度: ${(r.confidence * 100).toFixed(0)}%`);
    });

    // Claims
    console.log(`\n💬 Claims (${result.claims?.length || 0} 个):`);
    (result.claims || []).forEach((c, i) => {
      console.log(`  ${i + 1}. [${c.type}] ${c.text} (${c.polarity}) - 置信度: ${(c.confidence * 100).toFixed(0)}%`);
    });

    // 事件
    console.log(`\n📅 事件 (${result.events?.length || 0} 个):`);
    (result.events || []).forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.type}] ${e.title}`);
      if (e.time) console.log(`     时间: ${e.time}`);
      if (e.location) console.log(`     地点: ${e.location}`);
      if (e.participants.length > 0) console.log(`     参与方: ${e.participants.join(', ')}`);
    });

    // 图谱数据
    console.log(`\n🕸️  图谱数据:`);
    console.log(`  节点: ${result.graph?.nodes?.length || 0} 个`);
    console.log(`  边: ${result.graph?.links?.length || 0} 个`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ 测试完成!');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('\n请确保:');
    console.error('1. 服务器正在运行 (npm run dev)');
    console.error('2. GEMINI_API_KEY 环境变量已设置');
  }
}

// 运行测试
testExtraction();
