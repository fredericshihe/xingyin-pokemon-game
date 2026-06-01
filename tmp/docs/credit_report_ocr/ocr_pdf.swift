import Foundation
import PDFKit
import Vision
import AppKit

struct OCRPageResult: Codable {
    let page: Int
    let text: String
}

func render(page: PDFPage, scale: CGFloat = 2.5) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    let width = Int(bounds.width * scale)
    let height = Int(bounds.height * scale)
    guard width > 0, height > 0,
          let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
          let ctx = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
          ) else { return nil }
    ctx.setFillColor(NSColor.white.cgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.saveGState()
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    ctx.restoreGState()
    return ctx.makeImage()
}

func recognizeText(from image: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if #available(macOS 13.0, *) {
        request.automaticallyDetectsLanguage = false
    }
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])
    let observations = request.results ?? []
    let lines = observations.compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    return lines.joined(separator: "\n")
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("usage: ocr_pdf.swift <pdf> [startPage] [endPage]\n", stderr)
    exit(2)
}
let pdfURL = URL(fileURLWithPath: args[1])
let startPage = args.count >= 3 ? max(1, Int(args[2]) ?? 1) : 1
let endPageArg = args.count >= 4 ? max(startPage, Int(args[3]) ?? startPage) : startPage

guard let doc = PDFDocument(url: pdfURL) else {
    fputs("failed to open pdf\n", stderr)
    exit(1)
}
let endPage = min(endPageArg, doc.pageCount)
var results: [OCRPageResult] = []
for idx in startPage...endPage {
    guard let page = doc.page(at: idx - 1), let image = render(page: page) else { continue }
    let text = (try? recognizeText(from: image)) ?? ""
    results.append(OCRPageResult(page: idx, text: text))
}
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
let data = try encoder.encode(results)
FileHandle.standardOutput.write(data)
