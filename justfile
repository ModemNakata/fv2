quicksave MESSAGE="":
    git add .
    {{ if MESSAGE == "" { "git commit" } else { "git commit -m '" + MESSAGE + "'" } }}
    git push
