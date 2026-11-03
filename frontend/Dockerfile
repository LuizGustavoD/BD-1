FROM nginx:alpine

# Remove configuração padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copia nossa configuração de proxy reverso e estáticos
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos da interface
COPY . /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
