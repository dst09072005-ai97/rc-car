# BẢNG THAM CHIẾU MỸ THUẬT VÀ KHÔNG GIAN ĐÔ THỊ (ART REFERENCE BOARD)

**Định hướng phong cách đã chốt:** **Phương án B — Stylized Realistic (Hiện thực Cách điệu hóa)**  
*Tỷ lệ thực tế 1:1 theo mét, vật liệu PBR có độ nhám/kim loại tự nhiên, hình khối kiến trúc có chiều sâu thị giác, ánh sáng tự nhiên nhiệt đới, tối ưu hóa nghiêm ngặt cho Meta Quest 3 standalone.*

---

## I. MA TRẬN PHÂN LOẠI TÀI NGUYÊN (ASSET CATEGORIZATION MATRIX)

Để bảo đảm tính trung thực tuyệt đối của dữ liệu, toàn bộ tài nguyên được phân tách thành 3 nhóm rõ rệt:

1. **Category A — Visual References (Hình ảnh Tham chiếu Nghệ thuật):** Chỉ dùng làm tư liệu định hướng hình khối, màu sắc, ánh sáng, góc nhìn. Tuyệt đối không dùng làm tài sản 3D nhúng trong game.
2. **Category B — Project Internal Assets (Tài sản Nội bộ Tự sản xuất):** Các mô hình procedural do script Blender nội bộ tạo ra và quản lý mã nguồn trực tiếp trong repo.
3. **Category C — Production External Assets (Tài nguyên Sản xuất Bên ngoài):** Các thư viện texture/model bên thứ ba được tuyển chọn, phải kiểm tra giấy phép chi tiết trước khi import.

---

## II. BẢNG THAM CHIẾU HÌNH ẢNH THỰC TẾ (VISUAL REFERENCE BOARD)

| STT | Khu vực / Đối tượng | Mô tả hình khối & Ngôn ngữ Kiến trúc | Vật liệu & Xử lý bề mặt | Bảng màu chủ đạo (Color Palette) | Nguồn tham chiếu thực tế / URL | Trạng thái |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| 1 | **Nhà phố Shophouse Hiện đại (Việt Nam / Đông Nam Á)** | Khối hộp vươn ban công, tầng trệt cao $3{,}8\,\text{m}$ ốp kính mở quán cafe, 2 tầng lầu có lam chắn nắng gỗ, cục nóng điều hòa gắn ngoài tường. | Tường trát vữa sần nhẹ (Plaster), lam gỗ composite (Wood trim), kính cường lực trong suốt phản xạ nhẹ. | Trắng kem `#E0DCD5`, Gỗ sồi ấm `#6B472E`, Khung nhôm đen mờ `#2E3033`. | Tham chiếu kiến trúc nhà phố đô thị TP.HCM / Đà Nẵng: [ArchDaily Vietnam Shophouse Projects](https://www.archdaily.com/search/projects/country/vietnam) | **VERIFIED (Reference Only)** |
| 2 | **Mái hiên Di động & Bàn ghế Vỉa hè** | Mái hiên tay quay vải bạt vươn $1{,}8\,\text{m}$ dốc $15^\circ$, bàn tròn đường kính $80\,\text{cm}$ kèm 2 ghế tựa thấp đặc trưng văn hóa cafe phố. | Vải bạt sọc chống nước (Fabric), chân bàn sắt sơn tĩnh điện, mặt bàn gỗ công nghiệp. | Xanh rêu đậm `#267359`, Kem nhạt `#F2EFE9`, Sắt đen `#1F2124`. | Văn hóa Cafe vỉa hè Sài Gòn / Hà Nội: [Vietnam Urban Street Cafe Aesthetics](https://vietnam.travel/things-to-do/vietnamese-coffee-culture) | **VERIFIED (Reference Only)** |
| 3 | **Mặt đường & Vỉa hè Lát đá Terazzo** | Lòng đường nhựa asphalt 2 làn có vạch sơn vàng đứt đoạn, vỉa hè lát gạch con sâu / đá hoa cương chống trơn, gờ bó vỉa vát góc $45^\circ$. | Nhựa đường hạt mịn (Asphalt), gạch bê tông vỉa hè giả đá (Terazzo paver), sơn nhiệt dẻo phản quang. | Xám nhựa đường `#2A2C30`, Xám đá vỉa hè `#B8B3A8`, Vàng vạch kẻ `#F2D126`. | Tiêu chuẩn mặt cắt đường đô thị: [Vietnam Urban Road Standards TCVN 104:2007](https://vanbanphapluat.co/tcvn-104-2007-duong-do-thi-yeu-cau-thiet-ke) | **VERIFIED (Reference Only)** |
| 4 | **Trạm dừng Xe buýt Đô thị & Cây xanh** | Nhà chờ khung thép tiền chế mái kính/tôn vòm, vách sau kính an toàn, bồn cây hình vuông bảo vệ gốc cây bóng mát bàng Đài Loan/xà cừ. | Khung thép mạ kẽm sơn tĩnh điện, kính cường lực laminate, vỏ cây sần sùi, tán lá dày. | Xám thép `#475261`, Xanh lá cây tự nhiên `#306B33`, Đất ẩm `#423223`. | Trạm dừng xe buýt thông minh đô thị mới: [Ho Chi Minh City Bus Shelter Design](https://buytphcm.com.vn) | **VERIFIED (Reference Only)** |
| 5 | **Cột đèn Chiếu sáng & Dây kỹ thuật** | Cột thép bát giác cao $5{,}5\,\text{m}$ vươn cần đơn $1{,}3\,\text{m}$, chóa đèn LED dẹt, bó cáp viễn thông gom gọn đặc thù đô thị đang hiện đại hóa. | Thép mạ nhúng nóng, nhựa chóa đèn chống lóa, vỏ bọc cáp PVC đen. | Xám bạc kim loại `#7D838A`, Đen cáp `#18191A`, Ánh sáng 4000K vàng ấm. | Thiết bị chiếu sáng công cộng: [Urban Street Lighting Standards](https://www.philips.vn/c-m-o/chieu-sang-ngoai-troi) | **VERIFIED (Reference Only)** |

---

## III. NGUYÊN TẮC ÁNH SÁNG VÀ SHADER CHO VR META QUEST 3

1. **Nhiệt độ màu & Ánh sáng môi trường (Lighting & Atmosphere):**
   * Sử dụng nguồn sáng chính `DirectionalLight3D` mô phỏng ánh nắng xế chiều (Sun angle: $45^\circ$, Sun energy: $1{,}2$, Color: `#FFF4E0` vàng nắng ấm).
   * Bầu trời `Sky` với màu nền tán xạ khí quyển dịu nhẹ, hạn chế độ tương phản gắt làm mỏi mắt trong môi trường thực tế ảo lập thể (Stereoscopic VR).
2. **Kiểm soát độ nhám và phản xạ (Roughness & Specular):**
   * Vỉa hè và tường nhà có độ nhám cao ($Roughness \ge 0{,}70$) để triệt tiêu hiện tượng nhấp nháy specular (specular aliasing / crawling pixels) trên thấu kính Pancake của Quest 3.
   * Kính và kim loại chỉ dùng độ phản chiếu cục bộ với roughness $0{,}10 - 0{,}30$, không bật screen-space reflections (SSR) tốn tài nguyên.
3. **Quy tắc phối màu hài hòa (Color Harmonies):**
   * Tông màu chủ đạo chiếm 70% không gian là các dải màu trung tính (Neutral tones: xám nhựa đường, xám đá vỉa hè, tường trắng kem).
   * 20% là màu thiên nhiên (xanh tán cây, cỏ bồn hoa).
   * 10% là điểm nhấn thị giác (Accent: vàng vạch kẻ đường, xanh rêu mái hiên cafe, gỗ biển hiệu).
