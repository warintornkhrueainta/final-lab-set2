FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
# แก้ตรงนี้ครับ: จุด (เว้นวรรค) จุด
COPY . .
EXPOSE 3000
CMD ["node", "src/index.js"]