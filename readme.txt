sudo docker build -t send_new_earthquake_app .
sudo docker run -p 12000:12000 -d --restart always send_new_earthquake_app

