funcjs:
	npm i @ton-community/func-js@0.8.0

proxy:
	npx func-js ./proxy.fc --boc ./proxy.boc

nominators:
	npx func-js ./nominators.fc --boc ./nominators.boc

vanity:
	npx func-js ./vanity-address.fc --boc ./vanity-address.boc

compile: proxy nominators vanity

base64:
	cat proxy.boc | base64 > proxy.txt
	cat nominators.boc | base64 > nominators.txt
	cat vanity-address.boc | base64 > vanity-address.txt

build: compile base64

.PHONY: tests
tests:
	cd tests/ && npx blueprint test
