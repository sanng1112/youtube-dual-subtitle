# DualSub - YouTube Dual Subtitle Extension 🎯

> Học tiếng Anh qua các khóa học CS hàng đầu với phụ đề song ngữ Anh-Việt

## 🌟 Tính năng

- **Phụ đề song ngữ** - Hiển thị đồng thời tiếng Anh và tiếng Việt trên video YouTube
- **Hỗ trợ nhiều ngôn ngữ** - Chọn bất kỳ cặp ngôn ngữ nào (mặc định: Anh ➡ Việt)
- **Tự động dịch** - Dùng tính năng dịch phụ đề có sẵn của YouTube
- **Tùy chỉnh giao diện** - Thay đổi vị trí, cỡ chữ, màu sắc phụ đề
- **Tương thích SPA** - Hoạt động với điều hướng YouTube (không cần tải lại trang)
- **Phát hiện tự động** - Tự động nhận diện phụ đề có sẵn trên video

## 🎓 Ứng dụng học tập

Hoàn hảo cho việc học các khóa học CS như:

- **CS231n** - Convolutional Neural Networks for Visual Recognition
- **CS224n** - Natural Language Processing with Deep Learning
- **CS229** - Machine Learning
- **CS50** - Introduction to Computer Science
- **MIT OpenCourseWare**
- Và nhiều khóa học YouTube khác

## 🚀 Cách cài đặt

### Cài đặt từ Chrome Web Store (sớm ra mắt)

### Cài đặt thủ công (Developer Mode)

1. Tải code từ GitHub:
   ```bash
   git clone https://github.com/sanng1112/youtube-dual-subtitle.git
   ```

2. Mở Chrome/Edge/Brave và truy cập `chrome://extensions/`

3. Bật **Developer mode** (góc trên bên phải)

4. Click **Load unpacked** và chọn thư mục `youtube-dual-subtitle`

5. Truy cập YouTube, mở video bất kỳ có phụ đề

6. Click icon DualSub trên thanh extension để tùy chỉnh

## 🎮 Cách sử dụng

1. **Bật/Tắt**: Dùng toggle switch trên popup
2. **Chọn ngôn ngữ**: Chọn ngôn ngữ chính (English) và ngôn ngữ phụ (Tiếng Việt)
3. **Tùy chỉnh hiển thị**: Đổi vị trí và cỡ chữ phụ đề
4. **Tải lại**: Nếu phụ đề không hiện, click "Tải lại phụ đề"

## 🛠 Cấu trúc dự án

```
youtube-dual-subtitle/
├── manifest.json          # Chrome Extension Manifest V3
├── icons/                 # Extension icons
├── content/
│   ├── content.js         # Content script chính
│   └── content.css        # Style cho overlay phụ đề
├── popup/
│   ├── popup.html         # Giao diện popup
│   ├── popup.css          # Style popup
│   └── popup.js           # Logic popup
├── background/
│   └── background.js      # Service worker
└── README.md
```

## 🔧 Yêu cầu

- Chrome 88+ hoặc Edge 88+ hoặc Firefox 109+
- Video YouTube phải có phụ đề (CC)

## 📝 Lưu ý

- Extension chỉ hoạt động trên `youtube.com`
- Cần video YouTube có phụ đề (tự động hoặc thủ công)
- Phụ đề tiếng Việt được lấy từ tính năng dịch tự động của YouTube
- Chất lượng dịch phụ thuộc vào YouTube Automatic Translation

## 📄 Giấy phép

MIT License - Xem file [LICENSE](LICENSE)

## 🤝 Đóng góp

Mọi đóng góp đều được chào đón! Tạo issue hoặc pull request trên GitHub.

---

**Made with ❤️ for the learning community**
