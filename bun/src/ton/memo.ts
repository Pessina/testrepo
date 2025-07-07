import { Cell } from "@ton/core";

function extractMemoFromTonTransaction(txHex: string) {
  try {
    const cells = Cell.fromBoc(Buffer.from(txHex, "hex"));

    console.log(`Found ${cells.length} cells in the BOC`);

    // Try to extract memo from each cell
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];

      if (!cell) {
        continue;
      }

      try {
        const slice = cell.beginParse();

        // Method 1: Look for the specific transaction pattern
        if (slice.remainingBits >= 32) {
          const possibleOpCode = slice.preloadUint(32);
          console.log(`Possible op code: ${possibleOpCode}`);

          // Check if this matches the stake_deposit method (2077040623)
          if (possibleOpCode === 2077040623) {
            console.log("Found stake_deposit method!");
            slice.loadUint(32); // Skip method constant
            slice.loadUint(64); // Skip query ID
            slice.loadCoins(); // Skip gas amount

            if (slice.remainingBits > 0) {
              const memo = slice.loadStringTail();
              console.log(`✅ Memo found: "${memo}"`);
              return memo;
            }
          }
        }

        // Method 2: Search for text patterns in the cell data
        try {
          const buffer = Buffer.from(cell.bits.toString(), "hex");
          let text = buffer.toString("utf8").replace(/[^\x20-\x7E]/g, "");
          if (text.includes("chorusone") || text.includes("staking")) {
            console.log(`Found text pattern in cell data: "${text}"`);

            // Extract just the memo part
            const memoMatch = text.match(/chorusone[^\\s\\x00-\\x1F]*/i);
            if (memoMatch) {
              console.log(`✅ Extracted memo: "${memoMatch[0]}"`);
              return memoMatch[0];
            }
          }
        } catch (e) {
          console.log("Could not extract text from cell data");
        }

        // Method 3: Deep dive into transaction structure
        // The transaction might have the format: Transaction -> Message -> Body
        function searchInCellRecursively(cell: Cell, depth = 0): string | null {
          if (depth > 3) return null; // Prevent infinite recursion

          try {
            const slice = cell.beginParse();
            console.log(
              `  Depth ${depth}: ${slice.remainingBits} bits, ${cell.refs.length} refs`
            );

            // Try to find our op code in this cell
            while (slice.remainingBits >= 32) {
              const currentPos = slice.remainingBits;
              try {
                const opCode = slice.preloadUint(32);
                if (opCode === 2077040623) {
                  console.log(`Found stake_deposit op code at depth ${depth}!`);
                  slice.loadUint(32); // method
                  slice.loadUint(64); // query ID
                  slice.loadCoins(); // gas

                  if (slice.remainingBits > 0) {
                    const memo = slice.loadStringTail();
                    if (memo && memo.length > 0) {
                      console.log(`✅ Memo found at depth ${depth}: "${memo}"`);
                      return memo;
                    }
                  }
                } else {
                  // Skip this uint32 and try next position
                  slice.skip(32);
                }
              } catch (e) {
                // Skip 8 bits and try again
                if (slice.remainingBits >= 8) {
                  slice.skip(8);
                } else {
                  break;
                }
              }

              // Prevent infinite loop
              if (slice.remainingBits >= currentPos) {
                break;
              }
            }

            // Search in references
            for (let i = 0; i < cell.refs.length; i++) {
              const result = searchInCellRecursively(cell.refs[i], depth + 1);
              if (result) return result;
            }
          } catch (e) {
            console.log(`  Error at depth ${depth}:`, e.message);
          }

          return null;
        }

        const deepResult = searchInCellRecursively(cell);
        if (deepResult) {
          return deepResult;
        }
      } catch (cellError) {
        console.log(`Error parsing cell ${i}:`, cellError.message);
      }
    }

    // Method 4: Brute force search through the entire hex
    console.log("\n--- Brute force hex search ---");

    // Convert hex to buffer and search for the memo
    const buffer = Buffer.from(txHex, "hex");

    // Try UTF-8 decoding
    const utf8Text = buffer.toString("utf8");
    console.log(
      "UTF-8 text sample:",
      utf8Text.slice(-50).replace(/[^\x20-\x7E]/g, ".")
    );

    if (utf8Text.includes("chorusone")) {
      const match = utf8Text.match(/chorusone[^\x00-\x1F\x7F]*/);
      if (match) {
        console.log(`✅ Found via UTF-8 search: "${match[0]}"`);
        return match[0];
      }
    }

    // Try ASCII decoding
    let asciiText = "";
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      if (byte >= 32 && byte <= 126) {
        asciiText += String.fromCharCode(byte);
      } else {
        asciiText += ".";
      }
    }

    console.log("ASCII text sample:", asciiText.slice(-50));

    if (asciiText.includes("chorusone")) {
      const match = asciiText.match(/chorusone[a-zA-Z0-9\-_]*/);
      if (match) {
        console.log(`✅ Found via ASCII search: "${match[0]}"`);
        return match[0];
      }
    }

    // Direct hex pattern search
    const chorusHex = Buffer.from("chorusone-staking").toString("hex");
    console.log(`Looking for hex pattern: ${chorusHex}`);

    if (txHex.includes(chorusHex)) {
      console.log("✅ Found hex pattern in transaction!");
      return "chorusone-staking";
    }

    console.log("❌ No memo found");
    return null;
  } catch (error) {
    console.error("Error extracting memo:", error);
    return null;
  }
}

// Test with your transaction
const txHex =
  "b5ee9c720101040100ba0001a17369676e7ffffffd686b8b8b000001999790d8073dbc643d1b27e2453be15c5914ff5a586055657a08990a66390c6fcd30c69be348f5829e73e24f327e1a0b5878d4526ecab44d832f83460b5f2c3801a001020a0ec3c86d030203000000b162000382d481c9f89dd45ca6a0ce24876551ff5dd9002d35355e1e7369df39a6ef95a23c346000000000000000000000000000007bcd1fef00188e2ab37d5cf830186a073646b2d63686f7275736f6e652d7374616b696e678";

const memo = extractMemoFromTonTransaction(txHex);
console.log(`\nFinal result: ${memo || "No memo found"}`);
