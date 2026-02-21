import { getMcpClient } from "../server/services/mcp-client";

// 테스트를 위한 더미 텍스트 (Google 검색 결과 시뮬레이션)
const dummyText = `
Top attractions in Paris:
1. Eiffel Tower
Beautiful view. 
Price: 29.40 EUR
Image: https://example.com/eiffel.jpg

2. Louvre Museum
Mona Lisa is here.
Free admission for under 18s, otherwise 22 EUR.
Image: https://example.com/louvre.jpeg

3. Luxembourg Gardens
A nice park.
Entry is Free.
https://example.com/park.png
`;

function parseRawMcpText(rawText: string) {
    const items = [];
    // 번호 매겨진 리스트 형태로 텍스트 블록 나누기
    const blocks = rawText.split(/(?=\n\d+\.\s)/g);

    let rank = 1;
    for (const block of blocks) {
        // 번호와 함께 시작하는 장소 이름 추출 (예: "1. Eiffel Tower")
        const nameMatch = block.match(/\d+\.\s+([^\n]+)/);
        if (!nameMatch) continue;

        const nameEn = nameMatch[1].trim();

        // 가격 데이터 추출 (EUR, € 기호 주변 숫자, 또는 Free/무료 판별)
        const priceMatch = block.match(/(?:EUR|€)\s*([0-9.,]+)/i) || block.match(/([0-9.,]+)\s*(?:EUR|€)/i);
        const isFree = /free(?! cancellation)|무료/i.test(block);

        let priceEur = null;
        if (isFree) {
            priceEur = 0;
        } else if (priceMatch) {
            priceEur = parseFloat(priceMatch[1].replace(',', '.')); // 유럽식 쉼표 소수점 처리
        }

        // 이미지 주소 추출 (http... .jpg/.jpeg/.png/.webp)
        const imgMatch = block.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/i);

        items.push({
            rank: rank++,
            nameEn: nameEn,
            priceEur: priceEur,
            imageUrl: imgMatch ? imgMatch[0] : null,
            source: "mcp_regex_parser"
        });
    }

    return items;
}

async function testRegex() {
    console.log("=== 파싱 테스트 시작 ===");
    console.log("원본 텍스트 샘플:");
    console.log(dummyText);
    console.log("------------------------");

    const parsedData = parseRawMcpText(dummyText);

    console.log("=== 정규식(Regex) 파싱 결과 (제미나이 미사용) ===");
    console.log(JSON.stringify(parsedData, null, 2));
    console.log("======================================");

    if (parsedData.length === 3) {
        console.log("✅ 성공적으로 3개의 장소 데이터가 파싱되었습니다!");
    } else {
        console.error("❌ 파싱 실패: 예상한 개수와 다릅니다.");
    }
}

testRegex();
