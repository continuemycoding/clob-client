FROM alpine

WORKDIR /home 

ARG APP=app

RUN apk add git
RUN git config --global user.email "you@example.com"
RUN git config --global user.name "Your Name"
RUN git clone https://polatrix-admin@bitbucket.org/polatrix/stream.git

RUN apk add python3 py3-pip
RUN pip install pytz --break-system-packages

COPY ./${APP} .
COPY .env .
COPY markets.json .

ENTRYPOINT ["./app"]
CMD ["default_arg1", "default_arg2", "default_arg3"]
